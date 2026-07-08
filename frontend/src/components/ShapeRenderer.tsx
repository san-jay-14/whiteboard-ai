import { Arrow, Ellipse, Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { shapesMap } from '../lib/doc';
import { getArrowEndpoints } from '../lib/geometry';
import type { Shape } from '../lib/types';

const SELECTED_STROKE = '#111827';

type Props = {
  shape: Shape;
  selected: boolean;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  // Selection intentionally does NOT also happen on drag-start (unlike
  // step-3/5): with multi-select, starting a drag on an already-selected
  // shape must never collapse the selection down to just that shape.
  onDragStart?: () => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  hideText?: boolean;
  // Only used for rect/ellipse/sticky — lets Canvas attach a Transformer.
  registerNode?: (node: Konva.Node | null) => void;
};

// Renders every Shape variant so the type union stays exhaustive. Arrow
// rendering never reads its own stored `points` — it looks up the current
// positions of fromShapeId/toShapeId on every render (step 6).
export default function ShapeRenderer({
  shape,
  selected,
  draggable,
  onSelect,
  onDragStart,
  onDragEnd,
  hideText,
  registerNode,
}: Props) {
  const commitMove = (x: number, y: number) => {
    shapesMap.set(shape.id, { ...shape, x, y });
  };

  const handlers = {
    id: shape.id,
    draggable,
    onClick: onSelect,
    onDragStart,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (onDragEnd) {
        onDragEnd(e);
      } else {
        commitMove(e.target.x(), e.target.y());
      }
    },
  };

  switch (shape.type) {
    case 'rect':
      return (
        <Rect
          ref={registerNode}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rotation={shape.rotation ?? 0}
          fill={shape.fill}
          stroke={selected ? SELECTED_STROKE : shape.stroke}
          strokeWidth={selected ? 3 : 2}
          dash={selected ? [6, 4] : undefined}
          {...handlers}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          ref={registerNode}
          x={shape.x}
          y={shape.y}
          radiusX={shape.radiusX}
          radiusY={shape.radiusY}
          rotation={shape.rotation ?? 0}
          fill={shape.fill}
          stroke={selected ? SELECTED_STROKE : shape.stroke}
          strokeWidth={selected ? 3 : 2}
          dash={selected ? [6, 4] : undefined}
          {...handlers}
        />
      );
    case 'text':
      return (
        <Text
          x={shape.x}
          y={shape.y}
          text={shape.text}
          fontSize={shape.fontSize}
          fill={selected ? SELECTED_STROKE : '#1f2937'}
          {...handlers}
        />
      );
    case 'stroke':
      return (
        <Line
          x={shape.x}
          y={shape.y}
          points={shape.points}
          stroke={selected ? SELECTED_STROKE : shape.color}
          strokeWidth={selected ? shape.strokeWidth + 2 : shape.strokeWidth}
          hitStrokeWidth={Math.max(shape.strokeWidth, 16)}
          lineCap="round"
          lineJoin="round"
          {...handlers}
        />
      );
    case 'sticky':
      return (
        <Group ref={registerNode} x={shape.x} y={shape.y} rotation={shape.rotation ?? 0} {...handlers}>
          <Rect
            width={shape.width}
            height={shape.height}
            fill={shape.color}
            stroke={selected ? SELECTED_STROKE : 'rgba(0,0,0,0.15)'}
            strokeWidth={selected ? 3 : 1}
            dash={selected ? [6, 4] : undefined}
            shadowBlur={4}
            shadowOpacity={0.2}
          />
          {!hideText && (
            <Text text={shape.text} width={shape.width} height={shape.height} padding={8} fontSize={14} fill="#1f2937" />
          )}
        </Group>
      );
    case 'arrow': {
      const endpoints = getArrowEndpoints(shape, (id) => shapesMap.get(id));
      if (!endpoints) return null; // attached shape missing — transient state, nothing to draw
      const { from, to } = endpoints;
      return (
        <Arrow
          x={0}
          y={0}
          points={[from.x, from.y, to.x, to.y]}
          stroke={selected ? SELECTED_STROKE : '#1f2937'}
          fill={selected ? SELECTED_STROKE : '#1f2937'}
          strokeWidth={selected ? 4 : 2}
          pointerLength={10}
          pointerWidth={10}
          id={shape.id}
          draggable={false}
          onClick={onSelect}
        />
      );
    }
  }
}
