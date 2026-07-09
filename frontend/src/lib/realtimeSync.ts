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
import type { LocalUser } from './identity';

export type PresencePeer = PresencePayload;

export type BoardSyncHandle = {
  disconnect: () => void;
  subscribePresence: (callback: () => void) => () => void;
  getPresenceSnapshot: () => PresencePeer[];
  requestAiReview: () => void;
};

function derivePresenceList(state: RealtimePresenceState<PresencePayload>): PresencePeer[] {
  return Object.values(state).flatMap((entries) =>
    entries.map((entry) => ({
      name: entry.name,
      color: entry.color,
      awarenessClientID: entry.awarenessClientID,
      kind: entry.kind,
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
    requestAiReview() {
      channel.send({ type: 'broadcast', event: MANUAL_REVIEW_EVENT, payload: {} }).catch(() => {});
    },
  };
}
