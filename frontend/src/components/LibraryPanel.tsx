import { useState } from 'react';
import { removeFromLibrary, useLibrary, type LibraryItem } from '../lib/library';
import { shapeGraphToThumbnailUri } from '../lib/thumbnail';
import type { Shape } from '../lib/types';

type Props = {
  onInsert: (item: LibraryItem) => void;
  onSaveSelection: () => void;
  canSave: boolean;
};

function thumbUri(shapes: Shape[]): string {
  const graph: Record<string, Shape> = {};
  for (const s of shapes) graph[s.id] = s;
  return shapeGraphToThumbnailUri(graph);
}

// Right-edge collapsible panel for the local shape library. A stamp is saved
// from the current selection and can be clicked to drop a copy onto the board.
export default function LibraryPanel({ onInsert, onSaveSelection, canSave }: Props) {
  const [open, setOpen] = useState(false);
  const items = useLibrary();

  return (
    <div className="absolute right-4 top-20 z-10 flex flex-col items-end gap-2">
      <button
        type="button"
        aria-label="Library"
        title="Library"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center rounded-lg shadow-md transition-colors ${
          open
            ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-300'
            : 'bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v14H4zM9 5v14M14 5v14" />
        </svg>
      </button>

      {open && (
        <div className="w-64 rounded-xl bg-white p-3 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
          <button
            type="button"
            onClick={onSaveSelection}
            disabled={!canSave}
            className="mb-3 w-full rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
          >
            Save selection to library
          </button>
          {items.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-400">
              Select shapes, then save them here as a reusable stamp.
            </p>
          ) : (
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    title="Insert"
                    onClick={() => onInsert(item)}
                    className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 p-1 transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <img src={thumbUri(item.shapes)} alt="" className="max-h-full max-w-full object-contain" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove"
                    title="Remove"
                    onClick={() => removeFromLibrary(item.id)}
                    className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-900/70 text-xs text-white group-hover:flex"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
