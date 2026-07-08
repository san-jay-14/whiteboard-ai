import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel, type RealtimePresenceState } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { base64ToUint8, uint8ToBase64 } from './base64';
import type { LocalUser } from './identity';

// Per brief section 4: base64-encode each update; chunk if the encoded
// payload exceeds ~200KB. This constant doubles as both the chunking
// threshold and the per-chunk size cap. Shared by doc updates and
// awareness updates — awareness payloads are tiny, so chunking on them is
// unlikely to trigger, but the guard logic is identical either way.
const CHUNK_SIZE = 200 * 1024;
const UPDATE_EVENT = 'yjs-update';
const AWARENESS_EVENT = 'yjs-awareness';
const REMOTE_ORIGIN = 'remote';

type ChunkedPayload = {
  origin: string;
  chunkIndex: number;
  totalChunks: number;
  updateId: string;
  data: string;
};

type PendingChunks = {
  totalChunks: number;
  received: Map<number, string>;
};

type PresencePayload = {
  name: string;
  color: string;
  awarenessClientID: number;
};

export type PresencePeer = PresencePayload;

export type BoardSyncHandle = {
  disconnect: () => void;
  subscribePresence: (callback: () => void) => () => void;
  getPresenceSnapshot: () => PresencePeer[];
};

// Buffers chunks by updateId and reassembles once all of them have
// arrived — Realtime broadcast doesn't guarantee delivery order.
function createChunkReassembler(onComplete: (bytes: Uint8Array) => void) {
  const pendingByUpdateId = new Map<string, PendingChunks>();
  return {
    receive(payload: ChunkedPayload) {
      const { updateId, chunkIndex, totalChunks, data } = payload;
      let entry = pendingByUpdateId.get(updateId);
      if (!entry) {
        entry = { totalChunks, received: new Map() };
        pendingByUpdateId.set(updateId, entry);
      }
      entry.received.set(chunkIndex, data);
      if (entry.received.size < entry.totalChunks) return;

      pendingByUpdateId.delete(updateId);
      let base64 = '';
      for (let i = 0; i < entry.totalChunks; i++) {
        base64 += entry.received.get(i);
      }
      onComplete(base64ToUint8(base64));
    },
    clear() {
      pendingByUpdateId.clear();
    },
  };
}

function sendChunked(channel: RealtimeChannel, event: string, clientId: string, bytes: Uint8Array) {
  const base64 = uint8ToBase64(bytes);
  const updateId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(base64.length / CHUNK_SIZE));
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const data = base64.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
    channel
      .send({
        type: 'broadcast',
        event,
        payload: { origin: clientId, chunkIndex, totalChunks, updateId, data },
      })
      .catch(() => {
        // Dropped connection mid-send — step 7 (persistence) handles full
        // resync on reconnect. For now, just don't let this throw.
      });
  }
}

// Queues sends until the channel reports SUBSCRIBED, then flushes in order.
function createGuardedSender(channel: RealtimeChannel, event: string, clientId: string) {
  const outbox: Uint8Array[] = [];
  let isSubscribed = false;
  return {
    send(bytes: Uint8Array) {
      if (!isSubscribed) {
        outbox.push(bytes);
        return;
      }
      sendChunked(channel, event, clientId, bytes);
    },
    onSubscribed() {
      isSubscribed = true;
      const queued = outbox.splice(0, outbox.length);
      queued.forEach((bytes) => sendChunked(channel, event, clientId, bytes));
    },
    onDisconnected() {
      isSubscribed = false;
    },
  };
}

function derivePresenceList(state: RealtimePresenceState<PresencePayload>): PresencePeer[] {
  return Object.values(state).flatMap((entries) =>
    entries.map((entry) => ({
      name: entry.name,
      color: entry.color,
      awarenessClientID: entry.awarenessClientID,
    })),
  );
}

// Wires doc updates, awareness updates, and Presence onto one Realtime
// channel keyed by boardId, per brief section 4. Returns a handle to
// disconnect and to read/subscribe to the Presence-derived peer list.
export function connectBoardSync(
  doc: Y.Doc,
  awareness: Awareness,
  boardId: string,
  localUser: LocalUser,
): BoardSyncHandle {
  const clientId = crypto.randomUUID();

  const channel = supabase.channel(`board:${boardId}`, {
    config: { broadcast: { self: false } },
  });

  const updateSender = createGuardedSender(channel, UPDATE_EVENT, clientId);
  const awarenessSender = createGuardedSender(channel, AWARENESS_EVENT, clientId);

  const updateReassembler = createChunkReassembler((bytes) => {
    Y.applyUpdate(doc, bytes, REMOTE_ORIGIN);
  });
  const awarenessReassembler = createChunkReassembler((bytes) => {
    applyAwarenessUpdate(awareness, bytes, REMOTE_ORIGIN);
  });

  function handleLocalDocUpdate(update: Uint8Array, origin: unknown) {
    if (origin === REMOTE_ORIGIN) return; // don't re-broadcast updates that came from the network
    updateSender.send(update);
  }

  function handleLocalAwarenessUpdate(
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) {
    if (origin === REMOTE_ORIGIN) return; // don't re-broadcast updates that came from the network
    const changedClients = added.concat(updated, removed);
    if (changedClients.length === 0) return;
    awarenessSender.send(encodeAwarenessUpdate(awareness, changedClients));
  }

  channel.on('broadcast', { event: UPDATE_EVENT }, ({ payload }: { payload: ChunkedPayload }) => {
    if (payload.origin === clientId) return; // defense-in-depth; self:false already filters this
    updateReassembler.receive(payload);
  });

  channel.on('broadcast', { event: AWARENESS_EVENT }, ({ payload }: { payload: ChunkedPayload }) => {
    if (payload.origin === clientId) return;
    awarenessReassembler.receive(payload);
  });

  let presenceSnapshot: PresencePeer[] = [];
  const presenceListeners = new Set<() => void>();

  channel.on('presence', { event: 'sync' }, () => {
    presenceSnapshot = derivePresenceList(channel.presenceState<PresencePayload>());
    presenceListeners.forEach((listener) => listener());
  });

  doc.on('update', handleLocalDocUpdate);
  awareness.on('update', handleLocalAwarenessUpdate);

  // Own initial state — queued by awarenessSender until subscribed.
  awareness.setLocalState({ name: localUser.name, color: localUser.color, cursor: null });

  channel.subscribe((status) => {
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      updateSender.onSubscribed();
      awarenessSender.onSubscribed();
      channel
        .track({
          name: localUser.name,
          color: localUser.color,
          awarenessClientID: awareness.clientID,
        } satisfies PresencePayload)
        .catch(() => {});
    } else {
      // CLOSED / TIMED_OUT / CHANNEL_ERROR — stop sending until we see
      // SUBSCRIBED again (Realtime auto-rejoins the channel on reconnect).
      updateSender.onDisconnected();
      awarenessSender.onDisconnected();
    }
  });

  function handleBeforeUnload() {
    removeAwarenessStates(awareness, [awareness.clientID], 'window-unload');
    channel.untrack();
  }
  window.addEventListener('beforeunload', handleBeforeUnload);

  return {
    disconnect() {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      removeAwarenessStates(awareness, [awareness.clientID], 'disconnect');
      doc.off('update', handleLocalDocUpdate);
      awareness.off('update', handleLocalAwarenessUpdate);
      updateReassembler.clear();
      awarenessReassembler.clear();
      presenceListeners.clear();
      supabase.removeChannel(channel);
    },
    subscribePresence(callback) {
      presenceListeners.add(callback);
      return () => presenceListeners.delete(callback);
    },
    getPresenceSnapshot() {
      return presenceSnapshot;
    },
  };
}
