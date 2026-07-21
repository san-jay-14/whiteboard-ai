import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env';
import {
  AWARENESS_EVENT,
  MANUAL_REVIEW_EVENT,
  REMOTE_ORIGIN,
  UPDATE_EVENT,
  createChunkReassembler,
  createGuardedSender,
  type ChunkedPayload,
} from './shared/transport';
import { AGENT_BROADCAST_ID, AGENT_COLOR, AGENT_NAME, type AwarenessState } from './shared/presence';
import { byteaHexToBytes } from './shared/bytea';
import type { Shape, ShapeGraph } from './shapes/types';
import { runReasoningPass, type AiLogEntry, type ToolCall } from './reasoning';
import { executeToolCalls } from './executor';

// Debounce trigger (brief section 5): fire a reasoning pass ~5s after the
// last human/peer doc update on a watched board.
const DEBOUNCE_MS = 5000;

// How often the supervisor rescans the boards table to pick up boards created
// after startup (and drop deleted ones). New boards get the AI within this
// window.
const POLL_MS = 15000;

// Cap concurrent Anthropic reasoning passes ACROSS all boards so a burst of
// activity on many boards can't fan out into unbounded parallel API calls.
const MAX_CONCURRENT_PASSES = 3;
let activePasses = 0;

// How many recent interaction-log entries to feed back into a pass as context
// (the whiteboard has no chat UI, so this shared log is the AI's memory).
const MAX_HISTORY = 12;

// Cap the shared interaction log so it can't grow without bound in the doc.
const MAX_LOG_ENTRIES = 100;

// The agent has no mouse; it parks a fixed cursor so it renders in the
// awareness layer as a visible, distinct "watching" presence (step 9).
const PARKED_CURSOR = { x: 140, y: 150 };

// Backend service → service-role key (bypasses RLS to read every board's
// snapshot and join its channel), mirroring the mcp-server. No user session.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Everything for watching ONE board: its own Y.Doc, awareness, Realtime
// channel, and debounced reasoning loop. Returns a cleanup function that the
// supervisor calls if the board is deleted or on shutdown.
async function watchBoard(boardId: string): Promise<() => Promise<void>> {
  const label = boardId.slice(0, 8);
  const doc = new Y.Doc();
  const shapesMap: Y.Map<Shape> = doc.getMap('shapes');
  // Shared board metadata (currently just the AI on/off switch) and the
  // interaction log — both live in the same Y.Doc so they sync over the
  // normal channel and persist in the snapshot alongside the shapes.
  const metaMap: Y.Map<unknown> = doc.getMap('meta');
  const aiLog: Y.Array<AiLogEntry> = doc.getArray('aiLog');

  // Default ON: only an explicit `false` disables the assistant.
  const isAiEnabled = () => metaMap.get('aiEnabled') !== false;

  function appendLog(entry: AiLogEntry) {
    aiLog.push([entry]);
    // Trim from the front if it has grown past the cap.
    const overflow = aiLog.length - MAX_LOG_ENTRIES;
    if (overflow > 0) aiLog.delete(0, overflow);
  }

  function summarize(calls: ToolCall[]): string {
    const counts = new Map<string, number>();
    for (const c of calls) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    const noun = (name: string) =>
      ({
        create_shape: 'shape',
        propose_connector: 'connector',
        propose_group: 'group',
        propose_annotation: 'annotation',
        move_shape: 'move',
        update_shape: 'edit',
      })[name] ?? name;
    return [...counts.entries()].map(([name, n]) => `${n} ${noun(name)}${n === 1 ? '' : 's'}`).join(', ');
  }

  // Load-on-join, same as a normal client (brief step 7): apply the latest
  // snapshot before wiring listeners.
  const { data, error } = await supabase
    .from('board_snapshots')
    .select('yjs_state')
    .eq('board_id', boardId)
    .maybeSingle();
  if (error) throw new Error(`[${label}] snapshot fetch failed: ${error.message}`);
  const rawState = data?.yjs_state as string | undefined;
  if (rawState) {
    Y.applyUpdate(doc, byteaHexToBytes(rawState));
    console.log(`[${label}] loaded snapshot (${shapesMap.size} shapes)`);
  } else {
    console.log(`[${label}] no snapshot yet; starting empty`);
  }

  const awareness = new Awareness(doc);
  // A stable presence key (rather than the default per-connection random
  // one) means the agent is always the SAME logical presence entry across
  // restarts/redeploys — so a dev-mode reload or a redeploy replaces the
  // previous entry instead of piling up a new "AI" ghost every time (which is
  // otherwise how a crashed/killed process's stale connection would show up
  // indefinitely in every viewer's peer list).
  const channel = supabase.channel(`board:${boardId}`, {
    config: { broadcast: { self: false }, presence: { key: AGENT_BROADCAST_ID } },
  });

  const awarenessSender = createGuardedSender(channel, AWARENESS_EVENT, AGENT_BROADCAST_ID);
  // Step 10: the executor writes pendingReview shapes into shapesMap, so the
  // agent needs to broadcast its own doc updates too.
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

  // Republish presence with a transient status so watching clients can show a
  // "thinking/drawing" indicator. Called with no arg to return to idle.
  function trackStatus(status?: 'thinking' | 'drawing') {
    channel
      .track({
        name: AGENT_NAME,
        color: AGENT_COLOR,
        awarenessClientID: awareness.clientID,
        kind: 'agent',
        ...(status ? { status } : {}),
      })
      .catch(() => {});
  }

  async function runPass(trigger: 'debounce' | 'manual', instruction?: string) {
    // The on/off switch stops BOTH automatic and manual passes completely
    // (checked here rather than at the trigger, so a stale event can't slip
    // through while disabled).
    if (!isAiEnabled()) {
      console.log(`[${label}] AI disabled — skipping ${trigger} pass`);
      return;
    }
    if (isReasoning) {
      console.log(`[${label}] ignoring ${trigger} — a pass is already in flight`);
      return;
    }
    // Respect the global concurrency cap; retry shortly via the debounce.
    if (activePasses >= MAX_CONCURRENT_PASSES) {
      console.log(`[${label}] deferring ${trigger} — ${activePasses} passes active`);
      scheduleDebounce();
      return;
    }
    isReasoning = true;
    activePasses++;
    try {
      const shapeGraph = shapesMap.toJSON() as ShapeGraph;
      // Snapshot the log BEFORE appending this turn's entries, so history is
      // strictly prior context. (Use toArray()+slice rather than
      // Y.Array.slice — a negative index there yields undefined-filled holes.)
      const allLog = aiLog.toArray();
      const history = allLog.slice(Math.max(0, allLog.length - MAX_HISTORY));
      const trimmed = instruction?.trim();
      console.log(
        `[${label}] reasoning (${trigger}), ${Object.keys(shapeGraph).length} shape(s)` +
          (trimmed ? ` — instruction: "${trimmed}"` : ''),
      );
      if (trimmed) appendLog({ role: 'user', text: trimmed, ts: Date.now() });

      trackStatus('thinking');
      const { calls, text } = await runReasoningPass(shapeGraph, { instruction: trimmed, history });

      if (calls.length === 0) {
        console.log(`[${label}] no suggestions this pass`);
        // Only surface an "AI response" for directed passes; a silent
        // background pass with nothing to say shouldn't spam the log.
        if (trimmed) {
          appendLog({ role: 'assistant', text: text || 'No changes suggested for that request.', ts: Date.now() });
        }
      } else {
        console.log(`[${label}] applying ${calls.length} proposal(s): ${calls.map((c) => c.name).join(', ')}`);
        trackStatus('drawing');
        executeToolCalls(doc, shapesMap, calls);
        appendLog({
          role: 'assistant',
          text: text || `Proposed ${summarize(calls)} for review.`,
          ts: Date.now(),
        });
      }
    } catch (e) {
      console.error(`[${label}] reasoning pass failed`, e);
    } finally {
      isReasoning = false;
      activePasses--;
      trackStatus(); // back to idle
    }
  }

  function scheduleDebounce() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runPass('debounce');
    }, DEBOUNCE_MS);
  }

  channel.on('broadcast', { event: MANUAL_REVIEW_EVENT }, ({ payload }: { payload?: { prompt?: string } }) => {
    void runPass('manual', payload?.prompt);
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
  awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === REMOTE_ORIGIN) return;
      const changed = added.concat(updated, removed);
      if (changed.length === 0) return;
      awarenessSender.send(encodeAwarenessUpdate(awareness, changed));
    },
  );

  // Distinct AI identity (brief section 5). Queued until SUBSCRIBED.
  const localState: AwarenessState = {
    name: AGENT_NAME,
    color: AGENT_COLOR,
    cursor: PARKED_CURSOR,
    kind: 'agent',
  };
  awareness.setLocalState(localState);

  channel.subscribe((status) => {
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
        .then(() => console.log(`[${label}] present and watching`))
        .catch((e) => console.error(`[${label}] presence track failed`, e));
    } else {
      awarenessSender.onDisconnected();
      updateSender.onDisconnected();
    }
  });

  return async () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    removeAwarenessStates(awareness, [awareness.clientID], 'unwatch');
    try {
      await channel.untrack();
      await supabase.removeChannel(channel);
    } catch {
      // best-effort cleanup
    }
    awareness.destroy();
    doc.destroy();
  };
}

// --- Supervisor: watch every board, and keep in sync with new/deleted ones ---

const watchers = new Map<string, () => Promise<void>>();
let isSyncing = false;

async function listAllBoardIds(): Promise<string[]> {
  // Service role → sees every board regardless of RLS membership.
  const { data, error } = await supabase.from('boards').select('id');
  if (error) {
    console.error('board list query failed:', error.message);
    return [];
  }
  return (data ?? []).map((b) => b.id as string);
}

async function syncBoards() {
  if (isSyncing) return; // never overlap two scans
  isSyncing = true;
  try {
    const ids = await listAllBoardIds();
    const idSet = new Set(ids);

    // Join boards we're not watching yet (including brand-new ones).
    for (const id of ids) {
      if (watchers.has(id)) continue;
      try {
        const cleanup = await watchBoard(id);
        watchers.set(id, cleanup);
        console.log(`now watching ${id.slice(0, 8)} (${watchers.size} board(s) total)`);
      } catch (e) {
        console.error(`failed to watch ${id.slice(0, 8)}:`, e);
      }
    }

    // Leave boards that no longer exist.
    for (const [id, cleanup] of watchers) {
      if (idSet.has(id)) continue;
      console.log(`board ${id.slice(0, 8)} gone — unwatching`);
      watchers.delete(id);
      await cleanup().catch(() => {});
    }
  } finally {
    isSyncing = false;
  }
}

async function main() {
  await syncBoards();
  const timer = setInterval(() => void syncBoards(), POLL_MS);
  console.log(`AI agent supervisor started — watching ${watchers.size} board(s), rescanning every ${POLL_MS / 1000}s.`);

  const shutdown = async () => {
    console.log('shutting down…');
    clearInterval(timer);
    await Promise.all([...watchers.values()].map((cleanup) => cleanup().catch(() => {})));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
