import type { PresencePeer } from '../lib/realtimeSync';

type Props = {
  peers: PresencePeer[];
  localAwarenessClientID: number;
};

export default function PeerList({ peers, localAwarenessClientID }: Props) {
  return (
    <div className="absolute right-4 top-4 z-10 min-w-[160px] rounded-lg bg-white p-2 shadow-md">
      <div className="mb-1 px-1 text-xs font-medium text-neutral-400">
        {peers.length} online
      </div>
      <ul className="flex flex-col gap-1">
        {peers.map((peer) => (
          <li key={peer.awarenessClientID} className="flex items-center gap-2 px-1 text-sm text-neutral-700">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: peer.color }} />
            <span className="truncate">
              {peer.name}
              {peer.kind === 'agent' && (
                <span
                  className="ml-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: peer.color }}
                >
                  AI
                </span>
              )}
              {peer.awarenessClientID === localAwarenessClientID && (
                <span className="text-neutral-400"> (you)</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
