import { Arrow, Ellipse, Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { shapesMap } from '../lib/doc';
import type { Shape } from '../lib/types';

const SELECTED_STROKE = '#111827';
const STICKY_SIZE = 140;

type Props = {
  shape: Shape;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
};

// Renders every Shape variant so the type union stays exhaustive, even
// though only rect/ellipse/text/stroke are creatable via the UI this
// session — arrow and sticky creation land in a later build-order step.
export default function ShapeRenderer({ shape, selected, draggable, onSelect }: Props) {
  const commitMove = (x: number, y: number) => {
    shapesMap.set(shape.id, { ...shape, x, y });
  };

  const handlers = {
    draggable,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => commitMove(e.target.x(), e.target.y()),
  };

  switch (shape.type) {
    case 'rect':
      return (
        <Rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
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
          x={shape.x}
          y={shape.y}
          radiusX={shape.radiusX}
          radiusY={shape.radiusY}
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
        <Group x={shape.x} y={shape.y} {...handlers}>
          <Rect
            width={STICKY_SIZE}
            height={STICKY_SIZE}
            fill={shape.color}
            stroke={selected ? SELECTED_STROKE : 'rgba(0,0,0,0.15)'}
            strokeWidth={selected ? 3 : 1}
            dash={selected ? [6, 4] : undefined}
            shadowBlur={4}
            shadowOpacity={0.2}
          />
          <Text text={shape.text} width={STICKY_SIZE} padding={8} fontSize={14} fill="#1f2937" />
        </Group>
      );
    case 'arrow':
      return (
        <Arrow
          x={shape.x}
          y={shape.y}
          points={shape.points}
          stroke={selected ? SELECTED_STROKE : '#1f2937'}
          fill={selected ? SELECTED_STROKE : '#1f2937'}
          strokeWidth={selected ? 4 : 2}
          pointerLength={10}
          pointerWidth={10}
          {...handlers}
        />
      );
  }
}
