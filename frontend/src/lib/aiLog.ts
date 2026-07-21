import { useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

// One entry in the shared AI interaction log (the Yjs 'aiLog' array). This is
// the whiteboard's stand-in for a chat transcript: because there's no chat
// UI, the human's "Ask AI" instructions and the AI's plain-text responses are
// recorded here so (a) the agent has continuity across passes and (b) people
// can see what the AI has been doing. Written exclusively by the agent
// (ai-agent/src/index.ts); the frontend only reads it. Keep in sync with the
// AiLogEntry type in ai-agent/src/reasoning.ts.
export type AiLogEntry = { role: 'user' | 'assistant'; text: string; ts: number };

// useSyncExternalStore requires getSnapshot to return a referentially-stable
// value between changes (a fresh array each call would loop). Cache toArray()
// and invalidate the cache from the observe handler, so a new array is only
// produced when the Yjs array actually mutates.
const snapshots = new WeakMap<Y.Array<AiLogEntry>, AiLogEntry[]>();

// Subscribe a component to the shared log, re-rendering on every change.
export function useAiLog(aiLog: Y.Array<AiLogEntry>): AiLogEntry[] {
  return useSyncExternalStore(
    (onStoreChange) => {
      const handler = () => {
        snapshots.delete(aiLog); // force a fresh snapshot on next read
        onStoreChange();
      };
      aiLog.observe(handler);
      return () => aiLog.unobserve(handler);
    },
    () => {
      let cached = snapshots.get(aiLog);
      if (!cached) {
        cached = aiLog.toArray();
        snapshots.set(aiLog, cached);
      }
      return cached;
    },
  );
}

// Subscribe to the shared AI on/off switch. Defaults to enabled: only an
// explicit `false` in the meta map turns it off (mirrors the agent's
// isAiEnabled check).
export function useAiEnabled(metaMap: Y.Map<unknown>): boolean {
  return useSyncExternalStore(
    (onChange) => {
      metaMap.observe(onChange);
      return () => metaMap.unobserve(onChange);
    },
    () => metaMap.get('aiEnabled') !== false,
  );
}
