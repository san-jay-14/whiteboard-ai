import * as Y from 'yjs';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { base64ToUint8, uint8ToBase64 } from './base64';

// Per brief section 4: base64-encode each Yjs update; chunk if the encoded
// payload exceeds ~200KB. This constant doubles as both the chunking
// threshold and the per-chunk size cap.
const CHUNK_SIZE = 200 * 1024;
const EVENT_NAME = 'yjs-update';
const REMOTE_ORIGIN = 'remote';

type YjsUpdatePayload = {
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

// Wires doc's local updates onto a Supabase Realtime Broadcast channel
// keyed by boardId, and applies remote updates back onto doc. Returns a
// cleanup function that unsubscribes and removes the doc listener.
export function connectBoardSync(doc: Y.Doc, boardId: string): () => void {
  const clientId = crypto.randomUUID();
  const pendingByUpdateId = new Map<string, PendingChunks>();
  const outbox: Uint8Array[] = [];
  let isSubscribed = false;

  const channel = supabase.channel(`board:${boardId}`, {
    config: { broadcast: { self: false } },
  });

  function applyRemoteUpdate(payload: YjsUpdatePayload) {
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
    const bytes = base64ToUint8(base64);
    Y.applyUpdate(doc, bytes, REMOTE_ORIGIN);
  }

  function sendUpdate(update: Uint8Array) {
    const base64 = uint8ToBase64(update);
    const updateId = crypto.randomUUID();
    const totalChunks = Math.max(1, Math.ceil(base64.length / CHUNK_SIZE));
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const data = base64.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
      channel
        .send({
          type: 'broadcast',
          event: EVENT_NAME,
          payload: { origin: clientId, chunkIndex, totalChunks, updateId, data },
        })
        .catch(() => {
          // Dropped connection mid-send — step 7 (persistence) handles full
          // resync on reconnect. For now, just don't let this throw.
        });
    }
  }

  function handleLocalUpdate(update: Uint8Array, origin: unknown) {
    if (origin === REMOTE_ORIGIN) return; // don't re-broadcast updates that came from the network
    if (!isSubscribed) {
      outbox.push(update);
      return;
    }
    sendUpdate(update);
  }

  channel.on('broadcast', { event: EVENT_NAME }, ({ payload }: { payload: YjsUpdatePayload }) => {
    if (payload.origin === clientId) return; // defense-in-depth; self:false already filters this
    applyRemoteUpdate(payload);
  });

  doc.on('update', handleLocalUpdate);

  channel.subscribe((status) => {
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      isSubscribed = true;
      const queued = outbox.splice(0, outbox.length);
      queued.forEach(sendUpdate);
    } else {
      // CLOSED / TIMED_OUT / CHANNEL_ERROR — stop sending until we see
      // SUBSCRIBED again (Realtime auto-rejoins the channel on reconnect).
      isSubscribed = false;
    }
  });

  return () => {
    doc.off('update', handleLocalUpdate);
    pendingByUpdateId.clear();
    outbox.length = 0;
    supabase.removeChannel(channel);
  };
}
