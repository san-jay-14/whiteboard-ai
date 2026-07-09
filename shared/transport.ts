// Shared Realtime transport primitives, used by both the frontend
// (frontend/src/lib/realtimeSync.ts) and the AI agent (ai-agent). This is
// the single source of truth for the chunked base64 wire protocol described
// in PROJECT_BRIEF.md section 4 — do not re-implement it per package.
//
// Environment-agnostic and dependency-free: relies only on globals present
// in both the browser and Node 18+ (btoa/atob, crypto.randomUUID). The
// channel is typed structurally so /shared needs no node_modules of its own
// — a Supabase RealtimeChannel satisfies it.
type BroadcastSender = {
  send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown>;
};

// Broadcast is JSON-based, so binary Yjs/awareness updates are base64'd and
// split if the encoded payload exceeds this size, with a chunk header for
// order-independent reassembly on the far end.
export const CHUNK_SIZE = 200 * 1024;
export const UPDATE_EVENT = 'yjs-update';
export const AWARENESS_EVENT = 'yjs-awareness';
export const REMOTE_ORIGIN = 'remote';
// Step 10: manual trigger for an AI reasoning pass. Any client can send this
// (e.g. an "Ask AI to look" button); the agent listens on the same channel.
// Unlike yjs-update/yjs-awareness this carries no payload and isn't chunked.
export const MANUAL_REVIEW_EVENT = 'ai-request-review';

// Internal cap for String.fromCharCode(...) spreads to avoid call-stack
// limits on large arrays.
const FROM_CHARCODE_CHUNK = 0x8000;

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += FROM_CHARCODE_CHUNK) {
    const chunk = bytes.subarray(i, i + FROM_CHARCODE_CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type ChunkedPayload = {
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

// Buffers chunks by updateId and reassembles once all have arrived —
// Realtime broadcast doesn't guarantee delivery order.
export function createChunkReassembler(onComplete: (bytes: Uint8Array) => void) {
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

export function sendChunked(channel: BroadcastSender, event: string, clientId: string, bytes: Uint8Array): void {
  const base64 = uint8ToBase64(bytes);
  const updateId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(base64.length / CHUNK_SIZE));
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const data = base64.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
    channel
      .send({
        type: 'broadcast',
        event,
        payload: { origin: clientId, chunkIndex, totalChunks, updateId, data } satisfies ChunkedPayload,
      })
      .catch(() => {
        // Dropped connection mid-send — full resync on reconnect (snapshot
        // load) covers it. Don't let a transient send failure throw.
      });
  }
}

// Queues sends until the channel reports SUBSCRIBED, then flushes in order.
export function createGuardedSender(channel: BroadcastSender, event: string, clientId: string) {
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
