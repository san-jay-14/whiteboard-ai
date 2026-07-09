import { Group, Label, Line, Star, Tag, Text } from 'react-konva';
import type { RemotePeer } from '../hooks/useAwareness';

// A small pointer-shaped triangle, matching the visual language of most
// collaborative cursors (Figma/Google Docs style) — used for humans.
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
        .map((peer) => {
          const isAgent = peer.kind === 'agent';
          return (
            <Group key={peer.clientID} x={peer.cursor!.x} y={peer.cursor!.y} listening={false}>
              {isAgent ? (
                // Distinct AI cursor: a 4-point sparkle instead of a mouse pointer.
                <Star
                  numPoints={4}
                  innerRadius={2.5}
                  outerRadius={9}
                  rotation={0}
                  fill={peer.color}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ) : (
                <Line points={POINTER_POINTS} closed fill={peer.color} stroke="#ffffff" strokeWidth={1} />
              )}
              <Label x={14} y={2}>
                <Tag fill={peer.color} cornerRadius={3} />
                <Text
                  text={isAgent ? `✦ ${peer.name}` : peer.name}
                  fontSize={12}
                  fontStyle={isAgent ? 'bold' : 'normal'}
                  fill="#ffffff"
                  padding={4}
                />
              </Label>
            </Group>
          );
        })}
    </>
  );
}
