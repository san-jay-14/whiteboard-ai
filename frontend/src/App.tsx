import { useEffect, useState } from 'react';
import { ensureAnonSession } from './lib/auth';
import { listMyBoards, createBoard, type BoardListItem } from './lib/boards';
import { createLocalUser } from './lib/identity';
import BoardPicker from './components/BoardPicker';
import BoardSessionHost from './components/BoardSessionHost';

function App() {
  // Ephemeral per-tab display identity (name/color) for awareness; the
  // persisted DB identity is the anonymous auth user (see lib/auth).
  const [localUser] = useState(createLocalUser);
  const [uid, setUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureAnonSession()
      .then(async (id) => {
        if (cancelled) return;
        setUid(id);
        const list = await listMyBoards();
        if (cancelled) return;
        setBoards(list);
        setSelectedBoardId((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) setAuthError(e?.message ? String(e.message) : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async (name: string) => {
    if (!uid) return;
    setCreating(true);
    try {
      const board = await createBoard(name, uid);
      setBoards((prev) => [board, ...prev]);
      setSelectedBoardId(board.id);
    } catch (e) {
      console.error('create board failed', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-100">
      {authError ? (
        <div className="flex h-full w-full items-center justify-center px-8">
          <div className="max-w-md rounded-lg bg-white p-5 text-sm text-neutral-700 shadow-md">
            <p className="mb-2 font-medium text-neutral-900">Couldn’t start a session</p>
            <p className="mb-2">{authError}</p>
            <p className="text-neutral-500">
              If this mentions anonymous sign-ins, enable them in the Supabase dashboard
              (Authentication → Sign In / Providers → Anonymous sign-ins), then reload.
            </p>
          </div>
        </div>
      ) : !uid ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
          Connecting…
        </div>
      ) : (
        <>
          <BoardPicker
            boards={boards}
            selectedBoardId={selectedBoardId}
            onSelect={setSelectedBoardId}
            onCreate={handleCreate}
            creating={creating}
          />
          {selectedBoardId ? (
            <BoardSessionHost key={selectedBoardId} boardId={selectedBoardId} localUser={localUser} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
              Create a board to get started.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
