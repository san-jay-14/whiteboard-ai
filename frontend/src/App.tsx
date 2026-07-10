import { useCallback, useEffect, useState } from 'react';
import { ensureAnonSession } from './lib/auth';
import { listMyBoards, createBoard, type BoardListItem } from './lib/boards';
import { errorMessage } from './lib/errors';
import { createLocalUser } from './lib/identity';
import { showErrorToast } from './lib/toast';
import BoardListScreen from './components/BoardListScreen';
import BoardSessionHost from './components/BoardSessionHost';
import ToastHost from './components/ToastHost';

function App() {
  // Ephemeral per-tab display identity (name/color) for awareness; the
  // persisted DB identity is the anonymous auth user (see lib/auth).
  const [localUser] = useState(createLocalUser);
  const [uid, setUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshBoards = useCallback(async () => {
    setBoardsLoading(true);
    try {
      setBoards(await listMyBoards());
    } catch (e) {
      showErrorToast(`Couldn't load your boards: ${errorMessage(e)}`);
    } finally {
      setBoardsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureAnonSession()
      .then(async (id) => {
        if (cancelled) return;
        setUid(id);
        await refreshBoards();
      })
      .catch((e) => {
        if (!cancelled) setAuthError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshBoards]);

  const handleCreate = async (name: string) => {
    if (!uid) return;
    setCreating(true);
    try {
      const board = await createBoard(name, uid);
      setBoards((prev) => [board, ...prev]);
      setSelectedBoardId(board.id);
    } catch (e) {
      showErrorToast(`Couldn't create board: ${errorMessage(e)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleBack = () => {
    setSelectedBoardId(null);
    void refreshBoards(); // pick up thumbnail/last-updated changes from the session that just closed
  };

  const selectedBoard = boards.find((b) => b.id === selectedBoardId) ?? null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-100 dark:bg-neutral-900">
      <ToastHost />
      {authError ? (
        <div className="flex h-full w-full items-center justify-center px-8">
          <div className="max-w-md rounded-lg bg-white p-5 text-sm text-neutral-700 shadow-md">
            <p className="mb-2 font-medium text-neutral-900">Couldn't start a session</p>
            <p className="mb-2">{authError}</p>
            <p className="text-neutral-500">
              If this mentions anonymous sign-ins, enable them in the Supabase dashboard
              (Authentication → Sign In / Providers → Anonymous sign-ins), then reload.
            </p>
          </div>
        </div>
      ) : !uid ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">Connecting…</div>
      ) : selectedBoardId && selectedBoard ? (
        <BoardSessionHost
          key={selectedBoardId}
          boardId={selectedBoardId}
          ownerId={selectedBoard.owner_id}
          uid={uid}
          localUser={localUser}
          onBack={handleBack}
        />
      ) : (
        <BoardListScreen
          boards={boards}
          loading={boardsLoading}
          creating={creating}
          onOpen={setSelectedBoardId}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

export default App;
