import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_BOARD_ID } from './env';
import {
  AWARENESS_EVENT,
  REMOTE_ORIGIN,
  UPDATE_EVENT,
  createChunkReassembler,
  createGuardedSender,
  type ChunkedPayload,
} from '../../shared/transport';
import { AGENT_BROADCAST_ID, AGENT_COLOR, AGENT_NAME, type AwarenessState } from '../../shared/presence';
import { byteaHexToBytes } from '../../shared/bytea';

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

  // Load-on-join, same as a normal client (brief step 7): apply the latest
  // snapshot before wiring listeners. The agent never broadcasts doc
  // updates this session, so this can't echo out.
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

  // Keep the local doc in sync with peers, but never write back this session.
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
    }
  });

  const shutdown = async () => {
    console.log('shutting down…');
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
