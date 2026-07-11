import { useEffect, useState, type ComponentProps } from 'react';
import { Arrow, Ellipse, Group, Image as KonvaImage, Label, Line, Rect, Tag, Text } from 'react-konva';
import type Konva from 'konva';
import type * as Y from 'yjs';
import { getArrowEndpoints, getShapeBounds } from '../lib/geometry';
import { FONT_FAMILY_CSS } from '../lib/itemStyle';
import type { Shape, StrokeStyle } from '../lib/types';

const SELECTED_STROKE = '#6965db'; // Excalidraw selection violet
// Matches shared/presence.ts's AGENT_COLOR — same violet identifies the AI
// everywhere (cursor, presence chip, and now pendingReview shapes).
const AI_COLOR = '#7c3aed';
const PENDING_DASH = [6, 4];
const CORNER_RADIUS = 12; // "round" edges for rect/diamond

type Props = {
  shape: Shape;
  shapesMap: Y.Map<Shape>;
  selected: boolean;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  // Selection intentionally does NOT also happen on drag-start (unlike
  // step-3/5): with multi-select, starting a drag on an already-selected
  // shape must never collapse the selection down to just that shape.
  onDragStart?: () => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  hideText?: boolean;
  // Only used for rect/ellipse/diamond/sticky — lets Canvas attach a Transformer.
  registerNode?: (node: Konva.Node | null) => void;
  // step 11: drives the reviewReason tooltip in Canvas. Only meaningful for
  // pendingReview shapes, but wired for every type since the hover itself
  // is generic.
  onHoverChange?: (hovering: boolean) => void;
};

// Dash pattern for a non-selected outline, derived from the stroke style and
// scaled to the stroke width so it reads consistently at any thickness.
function dashArray(style: StrokeStyle | undefined, w: number): number[] | undefined {
  if (style === 'dashed') return [w * 4, w * 2.5];
  if (style === 'dotted') return [w, w * 2];
  return undefined;
}

// Small violet pill marking a shape as AI-authored-and-pending, per brief
// section 5 ("a small 'AI' badge"). Non-interactive so it never steals
// clicks from the shape underneath.
function AiBadge({ x, y }: { x: number; y: number }) {
  return (
    <Label x={x} y={y} listening={false}>
      <Tag fill={AI_COLOR} cornerRadius={3} />
      <Text text="AI" fontSize={10} fontStyle="bold" fill="#ffffff" padding={3} />
    </Label>
  );
}

// Loads an HTMLImageElement from a (data) URL for Konva to draw. Returns
// undefined until the image has decoded.
function useHtmlImage(src: string): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    const image = new window.Image();
    const onLoad = () => setImg(image);
    image.addEventListener('load', onLoad);
    image.src = src;
    return () => image.removeEventListener('load', onLoad);
  }, [src]);
  return img;
}

// Image shapes need a hook (image loading), so they can't render inline in the
// switch below — extracted into their own component.
function ImageShapeView({
  shape,
  selected,
  pending,
  registerNode,
  nodeProps,
}: {
  shape: Extract<Shape, { type: 'image' }>;
  selected: boolean;
  pending: boolean;
  registerNode?: (node: Konva.Node | null) => void;
  nodeProps: Partial<ComponentProps<typeof KonvaImage>>;
}) {
  const img = useHtmlImage(shape.src);
  return (
    <>
      <KonvaImage
        ref={registerNode}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rotation={shape.rotation ?? 0}
        image={img}
        stroke={selected ? SELECTED_STROKE : pending ? AI_COLOR : undefined}
        strokeWidth={selected || pending ? 2 : 0}
        dash={selected || pending ? PENDING_DASH : undefined}
        {...nodeProps}
      />
      {pending && <AiBadge x={shape.x} y={shape.y - 18} />}
    </>
  );
}

// Renders every Shape variant so the type union stays exhaustive. Arrow
// rendering never reads its own stored `points` — it looks up the current
// positions of fromShapeId/toShapeId on every render (step 6).
export default function ShapeRenderer({
  shape,
  shapesMap,
  selected,
  draggable,
  onSelect,
  onDragStart,
  onDragEnd,
  hideText,
  registerNode,
  onHoverChange,
}: Props) {
  const pending = shape.pendingReview ?? false;

  const commitMove = (x: number, y: number) => {
    shapesMap.set(shape.id, { ...shape, x, y });
  };

  const handlers = {
    id: shape.id,
    draggable,
    opacity: (shape.opacity ?? 100) / 100,
    onClick: onSelect,
    onDragStart,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (onDragEnd) {
        onDragEnd(e);
      } else {
        commitMove(e.target.x(), e.target.y());
      }
    },
    onMouseEnter: () => onHoverChange?.(true),
    onMouseLeave: () => onHoverChange?.(false),
  };

  // Shared outline treatment. Selection > pendingReview > plain style; the
  // first two both use the violet dashed look, otherwise the shape's own
  // strokeStyle/width apply.
  const baseWidth = shape.strokeWidth ?? 2;
  const strokeWidth = selected ? baseWidth + 1.5 : pending ? baseWidth + 0.5 : baseWidth;
  const outlineStroke = (fallback: string) => (selected ? SELECTED_STROKE : pending ? AI_COLOR : fallback);
  const dash = selected || pending ? PENDING_DASH : dashArray(shape.strokeStyle, baseWidth);

  switch (shape.type) {
    case 'rect': {
      const bounds = getShapeBounds(shape);
      return (
        <>
          <Rect
            ref={registerNode}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rotation={shape.rotation ?? 0}
            cornerRadius={shape.edges === 'round' ? CORNER_RADIUS : 0}
            fill={shape.fill}
            stroke={outlineStroke(shape.stroke)}
            strokeWidth={strokeWidth}
            dash={dash}
            {...handlers}
          />
          {pending && <AiBadge x={bounds.x} y={bounds.y - 18} />}
        </>
      );
    }
    case 'diamond': {
      const bounds = getShapeBounds(shape);
      const w = shape.width;
      const h = shape.height;
      return (
        <>
          <Line
            ref={registerNode}
            x={shape.x}
            y={shape.y}
            points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]}
            closed
            rotation={shape.rotation ?? 0}
            lineJoin={shape.edges === 'round' ? 'round' : 'miter'}
            fill={shape.fill}
            stroke={outlineStroke(shape.stroke)}
            strokeWidth={strokeWidth}
            dash={dash}
            {...handlers}
          />
          {pending && <AiBadge x={bounds.x} y={bounds.y - 18} />}
        </>
      );
    }
    case 'ellipse': {
      const bounds = getShapeBounds(shape);
      return (
        <>
          <Ellipse
            ref={registerNode}
            x={shape.x}
            y={shape.y}
            radiusX={shape.radiusX}
            radiusY={shape.radiusY}
            rotation={shape.rotation ?? 0}
            fill={shape.fill}
            stroke={outlineStroke(shape.stroke)}
            strokeWidth={strokeWidth}
            dash={dash}
            {...handlers}
          />
          {pending && <AiBadge x={bounds.x} y={bounds.y - 18} />}
        </>
      );
    }
    case 'text': {
      const bounds = getShapeBounds(shape); // bounds.x/y === shape.x/y for text
      return (
        <Group x={shape.x} y={shape.y} {...handlers}>
          {pending && (
            <Rect
              x={-4}
              y={-4}
              width={bounds.width + 8}
              height={bounds.height + 8}
              stroke={AI_COLOR}
              dash={PENDING_DASH}
              strokeWidth={1.5}
              cornerRadius={4}
              listening={false}
            />
          )}
          {!hideText && (
            <Text
              x={0}
              y={0}
              text={shape.text}
              fontSize={shape.fontSize}
              fontFamily={FONT_FAMILY_CSS[shape.fontFamily ?? 'hand']}
              align={shape.textAlign ?? 'left'}
              fill={selected ? SELECTED_STROKE : shape.color ?? '#1e1e1e'}
            />
          )}
          {pending && <AiBadge x={-4} y={-18} />}
        </Group>
      );
    }
    case 'stroke':
      return (
        <>
          <Line
            x={shape.x}
            y={shape.y}
            points={shape.points}
            stroke={outlineStroke(shape.color)}
            strokeWidth={selected ? shape.strokeWidth + 2 : shape.strokeWidth}
            dash={dash}
            hitStrokeWidth={Math.max(shape.strokeWidth, 16)}
            lineCap="round"
            lineJoin="round"
            {...handlers}
          />
          {pending && <AiBadge x={shape.x} y={shape.y - 18} />}
        </>
      );
    case 'line':
      return (
        <>
          <Line
            x={shape.x}
            y={shape.y}
            points={shape.points}
            stroke={outlineStroke(shape.color)}
            strokeWidth={strokeWidth}
            dash={dash}
            hitStrokeWidth={Math.max(shape.strokeWidth, 16)}
            lineCap="round"
            lineJoin="round"
            {...handlers}
          />
          {pending && <AiBadge x={shape.x} y={shape.y - 18} />}
        </>
      );
    case 'sticky':
      return (
        <Group ref={registerNode} x={shape.x} y={shape.y} rotation={shape.rotation ?? 0} {...handlers}>
          <Rect
            width={shape.width}
            height={shape.height}
            fill={shape.color}
            stroke={selected ? SELECTED_STROKE : pending ? AI_COLOR : 'rgba(0,0,0,0.15)'}
            strokeWidth={selected ? 3 : pending ? 2.5 : 1}
            dash={selected || pending ? PENDING_DASH : undefined}
            shadowBlur={4}
            shadowOpacity={0.2}
          />
          {!hideText && (
            <Text text={shape.text} width={shape.width} height={shape.height} padding={8} fontSize={14} fill="#1f2937" />
          )}
          {pending && <AiBadge x={-4} y={-18} />}
        </Group>
      );
    case 'image':
      return (
        <ImageShapeView
          shape={shape}
          selected={selected}
          pending={pending}
          registerNode={registerNode}
          nodeProps={handlers}
        />
      );
    case 'arrow': {
      const endpoints = getArrowEndpoints(shape, (id) => shapesMap.get(id));
      if (!endpoints) return null; // attached shape missing — transient state, nothing to draw
      const { from, to } = endpoints;
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      return (
        <>
          <Arrow
            x={0}
            y={0}
            points={[from.x, from.y, to.x, to.y]}
            stroke={outlineStroke('#1e1e1e')}
            fill={outlineStroke('#1e1e1e')}
            strokeWidth={selected ? baseWidth + 2 : baseWidth}
            dash={dash}
            opacity={(shape.opacity ?? 100) / 100}
            pointerLength={10}
            pointerWidth={10}
            id={shape.id}
            draggable={false}
            onClick={onSelect}
            onMouseEnter={handlers.onMouseEnter}
            onMouseLeave={handlers.onMouseLeave}
          />
          {pending && <AiBadge x={midX - 10} y={midY - 20} />}
        </>
      );
    }
  }
}
