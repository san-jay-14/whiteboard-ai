import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_BOARD_ID } from './env';
import {
  AWARENESS_EVENT,
  MANUAL_REVIEW_EVENT,
  REMOTE_ORIGIN,
  UPDATE_EVENT,
  createChunkReassembler,
  createGuardedSender,
  type ChunkedPayload,
} from '../../shared/transport';
import { AGENT_BROADCAST_ID, AGENT_COLOR, AGENT_NAME, type AwarenessState } from '../../shared/presence';
import { byteaHexToBytes } from '../../shared/bytea';
import type { Shape, ShapeGraph } from './shapes/types';
import { runReasoningPass } from './reasoning';
import { executeToolCalls } from './executor';

// Debounce trigger (brief section 5): fire a reasoning pass ~4-6s after the
// last human/peer doc update on the watched board.
const DEBOUNCE_MS = 5000;

// The agent has no mouse; it parks a fixed cursor so it renders in the
// awareness layer as a visible, distinct "watching" presence (step 9).
const PARKED_CURSOR = { x: 140, y: 150 };

// Backend service → service-role key (bypasses RLS to read the snapshot and
// join the channel), mirroring the mcp-server. No user session.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const doc = new Y.Doc();
  const shapesMap: Y.Map<Shape> = doc.getMap('shapes');

  // Load-on-join, same as a normal client (brief step 7): apply the latest
  // snapshot before wiring listeners.
  const { data, error } = await supabase
    .from('board_snapshots')
    .select('yjs_state')
    .eq('board_id', AGENT_BOARD_ID)
    .maybeSingle();
  if (error) throw new Error(`snapshot fetch failed: ${error.message}`);
  const rawState = data?.yjs_state as string | undefined;
  if (rawState) {
    Y.applyUpdate(doc, byteaHexToBytes(rawState));
    console.log(`Loaded snapshot for board ${AGENT_BOARD_ID} (${doc.getMap('shapes').size} shapes).`);
  } else {
    console.log(`No snapshot yet for board ${AGENT_BOARD_ID}; starting empty.`);
  }

  const awareness = new Awareness(doc);

  const channel = supabase.channel(`board:${AGENT_BOARD_ID}`, {
    config: { broadcast: { self: false } },
  });

  const awarenessSender = createGuardedSender(channel, AWARENESS_EVENT, AGENT_BROADCAST_ID);
  // Step 10: the executor now writes pendingReview shapes into shapesMap,
  // so (unlike step 9) the agent needs to broadcast its own doc updates too.
  const updateSender = createGuardedSender(channel, UPDATE_EVENT, AGENT_BROADCAST_ID);

  const updateReassembler = createChunkReassembler((bytes) => {
    Y.applyUpdate(doc, bytes, REMOTE_ORIGIN);
  });
  const awarenessReassembler = createChunkReassembler((bytes) => {
    applyAwarenessUpdate(awareness, bytes, REMOTE_ORIGIN);
  });

  channel.on('broadcast', { event: UPDATE_EVENT }, ({ payload }: { payload: ChunkedPayload }) => {
    if (payload.origin === AGENT_BROADCAST_ID) return;
    updateReassembler.receive(payload);
  });
  channel.on('broadcast', { event: AWARENESS_EVENT }, ({ payload }: { payload: ChunkedPayload }) => {
    if (payload.origin === AGENT_BROADCAST_ID) return;
    awarenessReassembler.receive(payload);
  });

  // --- Reasoning pass triggers (brief section 5) ---------------------------

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isReasoning = false;

  async function runPass(trigger: 'debounce' | 'manual') {
    if (isReasoning) {
      console.log(`[reasoning] ignoring ${trigger} trigger — a pass is already in flight`);
      return;
    }
    isReasoning = true;
    try {
      const shapeGraph = shapesMap.toJSON() as ShapeGraph;
      console.log(`[reasoning] running pass (${trigger}), ${Object.keys(shapeGraph).length} shape(s)`);
      const calls = await runReasoningPass(shapeGraph);
      if (calls.length === 0) {
        console.log('[reasoning] no suggestions this pass');
      } else {
        console.log(`[reasoning] applying ${calls.length} proposal(s): ${calls.map((c) => c.name).join(', ')}`);
        executeToolCalls(doc, shapesMap, calls);
      }
    } catch (e) {
      console.error('[reasoning] pass failed', e);
    } finally {
      isReasoning = false;
    }
  }

  function scheduleDebounce() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runPass('debounce');
    }, DEBOUNCE_MS);
  }

  channel.on('broadcast', { event: MANUAL_REVIEW_EVENT }, () => {
    void runPass('manual');
  });

  // Broadcast the agent's own doc writes; reset the idle timer on genuine
  // peer edits only (never on the agent's own writes — that would make it
  // perpetually re-trigger itself).
  function handleLocalDocUpdate(update: Uint8Array, origin: unknown) {
    if (origin === REMOTE_ORIGIN) {
      scheduleDebounce();
      return;
    }
    updateSender.send(update);
  }
  doc.on('update', handleLocalDocUpdate);

  // Broadcast the agent's own awareness changes (its identity/cursor).
  awareness.on('update', (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === REMOTE_ORIGIN) return;
    const changed = added.concat(updated, removed);
    if (changed.length === 0) return;
    awarenessSender.send(encodeAwarenessUpdate(awareness, changed));
  });

  // Distinct AI identity (brief section 5). Queued until SUBSCRIBED.
  const localState: AwarenessState = {
    name: AGENT_NAME,
    color: AGENT_COLOR,
    cursor: PARKED_CURSOR,
    kind: 'agent',
  };
  awareness.setLocalState(localState);

  channel.subscribe((status) => {
    console.log(`channel status: ${status}`);
    if (status === 'SUBSCRIBED') {
      awarenessSender.onSubscribed();
      updateSender.onSubscribed();
      channel
        .track({
          name: AGENT_NAME,
          color: AGENT_COLOR,
          awarenessClientID: awareness.clientID,
          kind: 'agent',
        })
        .then(() => console.log('AI agent present and watching.'))
        .catch((e) => console.error('presence track failed', e));
    } else {
      awarenessSender.onDisconnected();
      updateSender.onDisconnected();
    }
  });

  const shutdown = async () => {
    console.log('shutting down…');
    if (debounceTimer) clearTimeout(debounceTimer);
    removeAwarenessStates(awareness, [awareness.clientID], 'shutdown');
    try {
      await channel.untrack();
      await supabase.removeChannel(channel);
    } catch {
      // best-effort cleanup
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`AI agent connecting to board ${AGENT_BOARD_ID}…`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
