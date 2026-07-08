import { Group, Label, Line, Tag, Text } from 'react-konva';
import type { RemotePeer } from '../hooks/useAwareness';

// A small pointer-shaped triangle, matching the visual language of most
// collaborative cursors (Figma/Google Docs style).
const POINTER_POINTS = [0, 0, 0, 16, 4, 12, 7, 19, 10, 17.5, 7, 11, 12, 11];

type Props = {
  peers: RemotePeer[];
  presentClientIDs: Set<number>;
};

export default function CursorLayer({ peers, presentClientIDs }: Props) {
  return (
    <>
      {peers
        .filter((peer) => peer.cursor !== null && presentClientIDs.has(peer.clientID))
        .map((peer) => (
          <Group key={peer.clientID} x={peer.cursor!.x} y={peer.cursor!.y} listening={false}>
            <Line points={POINTER_POINTS} closed fill={peer.color} stroke="#ffffff" strokeWidth={1} />
            <Label x={14} y={2}>
              <Tag fill={peer.color} cornerRadius={3} />
              <Text text={peer.name} fontSize={12} fill="#ffffff" padding={4} />
            </Label>
          </Group>
        ))}
    </>
  );
}
