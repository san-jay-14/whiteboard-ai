import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { REALTIME_SUBSCRIBE_STATES, type RealtimePresenceState } from '@supabase/supabase-js';
import {
  AWARENESS_EVENT,
  MANUAL_REVIEW_EVENT,
  REMOTE_ORIGIN,
  UPDATE_EVENT,
  createChunkReassembler,
  createGuardedSender,
} from '../../../shared/transport';
import type { ChunkedPayload } from '../../../shared/transport';
import type { PresencePayload } from '../../../shared/presence';
import { supabase } from './supabaseClient';
import { fetchLatestSnapshot } from './snapshots';
import type { LocalUser } from './identity';

export type PresencePeer = PresencePayload;

// step 12: 'connected' is also the initial value — there's no meaningful
// "reconnecting" state before the very first successful subscribe (that
// window is already covered by BoardSessionHost's "Loading board…" screen).
export type ConnectionStatus = 'connected' | 'reconnecting';

export type BoardSyncHandle = {
  disconnect: () => void;
  subscribePresence: (callback: () => void) => () => void;
  getPresenceSnapshot: () => PresencePeer[];
  requestAiReview: (prompt?: string) => void;
  subscribeConnectionStatus: (callback: () => void) => () => void;
  getConnectionStatus: () => ConnectionStatus;
};

function derivePresenceList(state: RealtimePresenceState<PresencePayload>): PresencePeer[] {
  return Object.values(state).flatMap((entries) =>
    entries.map((entry) => ({
      name: entry.name,
      color: entry.color,
      awarenessClientID: entry.awarenessClientID,
      kind: entry.kind,
      status: entry.status,
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

  // step 12: reconnect/resync handling. Broadcast delivers nothing to a
  // disconnected client — it doesn't queue for later delivery — so a drop
  // can silently miss updates. On every SUBSCRIBED *after* the first, re-fetch
  // the latest snapshot and apply it (same as the initial join flow) to
  // catch up before resuming live broadcast.
  let hasConnectedOnce = false;
  let connectionStatus: ConnectionStatus = 'connected';
  const connectionListeners = new Set<() => void>();

  function setConnectionStatus(next: ConnectionStatus) {
    if (connectionStatus === next) return;
    connectionStatus = next;
    connectionListeners.forEach((listener) => listener());
  }

  async function resyncFromSnapshot() {
    try {
      const snapshot = await fetchLatestSnapshot(boardId);
      if (snapshot) Y.applyUpdate(doc, snapshot, REMOTE_ORIGIN);
    } catch (e) {
      console.error('post-reconnect resync failed', e);
    }
  }

  doc.on('update', handleLocalDocUpdate);
  awareness.on('update', handleLocalAwarenessUpdate);

  // Own initial state — queued by awarenessSender until subscribed.
  awareness.setLocalState({ name: localUser.name, color: localUser.color, cursor: null });

  channel.subscribe((status) => {
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      updateSender.onSubscribed();
      awarenessSender.onSubscribed();
      if (hasConnectedOnce) {
        void resyncFromSnapshot();
      }
      hasConnectedOnce = true;
      setConnectionStatus('connected');
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
      if (hasConnectedOnce) setConnectionStatus('reconnecting');
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
      connectionListeners.clear();
      supabase.removeChannel(channel);
    },
    subscribePresence(callback) {
      presenceListeners.add(callback);
      return () => presenceListeners.delete(callback);
    },
    getPresenceSnapshot() {
      return presenceSnapshot;
    },
    requestAiReview(prompt?: string) {
      const trimmed = prompt?.trim();
      const payload = trimmed ? { prompt: trimmed } : {};
      channel.send({ type: 'broadcast', event: MANUAL_REVIEW_EVENT, payload }).catch(() => {});
    },
    subscribeConnectionStatus(callback) {
      connectionListeners.add(callback);
      return () => connectionListeners.delete(callback);
    },
    getConnectionStatus() {
      return connectionStatus;
    },
  };
}
