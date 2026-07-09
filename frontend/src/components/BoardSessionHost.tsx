import { useEffect, useState } from 'react';
import { BoardSessionContext } from '../lib/BoardSessionContext';
import { openBoardSession, closeBoardSession, type BoardSession } from '../lib/session';
import type { LocalUser } from '../lib/identity';
import Canvas from './Canvas';

type Props = {
  boardId: string;
  ownerId: string;
  uid: string;
  localUser: LocalUser;
  onBack: () => void;
};

// Owns one board's session lifecycle. Rendered with key={boardId} so
// switching boards fully remounts this, guaranteeing the previous session
// is torn down (effect cleanup) before the next is opened.
export default function BoardSessionHost({ boardId, ownerId, uid, localUser, onBack }: Props) {
  const [session, setSession] = useState<BoardSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: BoardSession | null = null;

    openBoardSession(boardId, localUser).then(
      (s) => {
        // If this effect was cleaned up before the async open resolved
        // (fast board switch, or StrictMode's double-invoke), tear the
        // just-opened session down instead of leaking it.
        if (cancelled) {
          closeBoardSession(s);
          return;
        }
        opened = s;
        setSession(s);
      },
      (err) => {
        if (!cancelled) console.error('failed to open board', err);
      },
    );

    return () => {
      cancelled = true;
      if (opened) {
        closeBoardSession(opened);
        opened = null;
      }
      setSession(null);
    };
  }, [boardId, localUser]);

  if (!session) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
        Loading board…
      </div>
    );
  }

  return (
    <BoardSessionContext.Provider value={session}>
      <Canvas ownerId={ownerId} uid={uid} onBack={onBack} />
    </BoardSessionContext.Provider>
  );
}
