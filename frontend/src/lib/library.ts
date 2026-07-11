import { useSyncExternalStore } from 'react';
import type { Shape } from './types';

// A minimal, local (per-browser) shape library: save a selection as a
// reusable "stamp" and drop copies back onto any board. Stored in
// localStorage as a tiny external store so the panel re-renders on change.
// Full .excalidrawlib interop is out of scope.
export type LibraryItem = { id: string; shapes: Shape[]; createdAt: number };

const STORAGE_KEY = 'wb:library';
const listeners = new Set<() => void>();
let items: LibraryItem[] = load();

function load(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LibraryItem[];
  } catch {
    // ignore corrupt storage
  }
  return [];
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore (quota/unavailable)
  }
  listeners.forEach((l) => l());
}

export function addToLibrary(shapes: Shape[]) {
  if (shapes.length === 0) return;
  // Deep clone so later edits to the live shapes don't mutate the stored copy.
  items = [{ id: crypto.randomUUID(), shapes: JSON.parse(JSON.stringify(shapes)), createdAt: Date.now() }, ...items];
  persist();
}

export function removeFromLibrary(id: string) {
  items = items.filter((i) => i.id !== id);
  persist();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return items;
}

export function useLibrary(): LibraryItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Produces fresh copies of a stamp's shapes, translated so the group's
// top-left lands at `origin`, with new ids (and internal arrow references
// remapped so connectors keep pointing at their siblings, not the originals).
export function instantiateLibraryItem(item: LibraryItem, origin: { x: number; y: number }): Shape[] {
  const shapes = item.shapes;
  const minX = Math.min(...shapes.map((s) => s.x));
  const minY = Math.min(...shapes.map((s) => s.y));
  const idMap = new Map<string, string>();
  for (const s of shapes) idMap.set(s.id, crypto.randomUUID());

  const now = Date.now();
  const out: Shape[] = [];
  for (const s of shapes) {
    const clone = {
      ...s,
      id: idMap.get(s.id)!,
      x: origin.x + (s.x - minX),
      y: origin.y + (s.y - minY),
      createdAt: now,
    } as Shape;
    if (clone.type === 'arrow') {
      const from = idMap.get(clone.fromShapeId);
      const to = idMap.get(clone.toShapeId);
      if (!from || !to) continue; // endpoint not part of the stamp — drop the arrow
      clone.fromShapeId = from;
      clone.toShapeId = to;
    }
    out.push(clone);
  }
  return out;
}
