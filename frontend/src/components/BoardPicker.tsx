import { useState } from 'react';
import type { BoardListItem } from '../lib/boards';

type Props = {
  boards: BoardListItem[];
  selectedBoardId: string | null;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => void;
  creating: boolean;
};

// Minimal board list/switcher + create control (brief step 7 point 3 — no
// design polish yet). Sits top-center so it clears the left toolbar and the
// right-hand peer list.
export default function BoardPicker({ boards, selectedBoardId, onSelect, onCreate, creating }: Props) {
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled board';
    onCreate(name);
    setNewName('');
  };

  return (
    <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-white p-2 shadow-md">
      <select
        value={selectedBoardId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-700 outline-none"
      >
        {boards.length === 0 && <option value="">No boards yet</option>}
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {board.name}
          </option>
        ))}
      </select>
      <input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        placeholder="New board name"
        className="w-36 rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-700 outline-none"
      />
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {creating ? 'Creating…' : 'New board'}
      </button>
    </div>
  );
}
