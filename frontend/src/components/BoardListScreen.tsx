import { useState } from 'react';
import type { BoardListItem } from '../lib/boards';
import { shapeGraphToThumbnailUri } from '../lib/thumbnail';

type Props = {
  boards: BoardListItem[];
  loading: boolean;
  creating: boolean;
  onOpen: (boardId: string) => void;
  onCreate: (name: string) => void;
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// step 12: full-screen board list — replaces the step-7 dropdown. This is
// the app's landing screen; opening a board navigates into Canvas, and the
// "← Boards" toolbar button (see Toolbar.tsx) comes back here.
export default function BoardListScreen({ boards, loading, creating, onOpen, onCreate }: Props) {
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled board';
    onCreate(name);
    setNewName('');
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-neutral-100 dark:bg-neutral-900">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Your boards</h1>

        <div className="mb-8 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New board name"
            className="flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create board'}
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-400">Loading your boards…</div>
        ) : boards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
            No boards yet — create one above to get started.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => onOpen(board.id)}
                className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex aspect-video items-center justify-center overflow-hidden bg-neutral-100">
                  {board.shapeGraph && Object.keys(board.shapeGraph).length > 0 ? (
                    <img
                      src={shapeGraphToThumbnailUri(board.shapeGraph)}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-neutral-300">Empty board</span>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-medium text-neutral-900">{board.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">{formatRelativeTime(board.lastActivityAt)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
