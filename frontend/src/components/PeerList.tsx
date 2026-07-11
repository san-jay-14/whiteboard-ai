import type { PresencePeer } from '../lib/realtimeSync';

type Props = {
  peers: PresencePeer[];
  localAwarenessClientID: number;
};

export default function PeerList({ peers, localAwarenessClientID }: Props) {
  if (peers.length === 0) return null;

  return (
    <div className="absolute right-4 top-4 z-10 min-w-[180px] rounded-xl bg-white/95 p-2.5 shadow-lg ring-1 ring-black/5 backdrop-blur dark:bg-neutral-800/95 dark:ring-white/10">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{peers.length} online</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {peers.map((peer) => {
          const isYou = peer.awarenessClientID === localAwarenessClientID;
          const initial = (peer.name?.trim()?.[0] ?? '?').toUpperCase();
          return (
            <li
              key={peer.awarenessClientID}
              className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-neutral-700 dark:text-neutral-200"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-white dark:ring-neutral-800"
                style={{ backgroundColor: peer.color }}
              >
                {peer.kind === 'agent' ? '✦' : initial}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {peer.name}
                {peer.kind === 'agent' && (
                  <span
                    className="ml-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: peer.color }}
                  >
                    AI
                  </span>
                )}
                {isYou && <span className="text-neutral-400 dark:text-neutral-500"> (you)</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
