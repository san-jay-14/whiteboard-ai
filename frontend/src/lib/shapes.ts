import { STICKY_COLORS, STICKY_DEFAULT_SIZE } from './constants';
import { DEFAULT_ITEM_STYLE, type ItemStyle } from './itemStyle';
import { nearestAnchorPair } from './geometry';
import type {
  ArrowShape,
  DiamondShape,
  EllipseShape,
  ImageShape,
  LineShape,
  RectShape,
  Shape,
  StickyShape,
  StrokeShape,
  TextShape,
} from './types';

// No auth wired up yet — every shape created locally is attributed to this
// fixed id until step 4+ introduces real user identity.
const LOCAL_AUTHOR_ID = 'local-user';

function base(x: number, y: number) {
  return {
    id: crypto.randomUUID(),
    x,
    y,
    origin: 'user' as const,
    authorId: LOCAL_AUTHOR_ID,
    createdAt: Date.now(),
  };
}

// Style fields shared by every shape's outline (drawn from the current item
// style). Colours/dimensions are set per shape type below.
function outlineStyle(style: ItemStyle) {
  return { strokeStyle: style.strokeStyle, opacity: style.opacity };
}

export function createRect(
  x: number,
  y: number,
  width: number,
  height: number,
  style: ItemStyle = DEFAULT_ITEM_STYLE,
): RectShape {
  return {
    ...base(x, y),
    type: 'rect',
    width,
    height,
    fill: style.backgroundColor,
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidth,
    edges: style.edges,
    ...outlineStyle(style),
  };
}

export function createEllipse(
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  style: ItemStyle = DEFAULT_ITEM_STYLE,
): EllipseShape {
  return {
    ...base(x, y),
    type: 'ellipse',
    radiusX,
    radiusY,
    fill: style.backgroundColor,
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidth,
    ...outlineStyle(style),
  };
}

export function createDiamond(
  x: number,
  y: number,
  width: number,
  height: number,
  style: ItemStyle = DEFAULT_ITEM_STYLE,
): DiamondShape {
  return {
    ...base(x, y),
    type: 'diamond',
    width,
    height,
    fill: style.backgroundColor,
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidth,
    edges: style.edges,
    ...outlineStyle(style),
  };
}

export function createText(
  x: number,
  y: number,
  text: string,
  style: ItemStyle = DEFAULT_ITEM_STYLE,
): TextShape {
  return {
    ...base(x, y),
    type: 'text',
    text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    textAlign: style.textAlign,
    color: style.strokeColor,
    opacity: style.opacity,
  };
}

export function createStroke(
  x: number,
  y: number,
  points: number[],
  style: ItemStyle = DEFAULT_ITEM_STYLE,
): StrokeShape {
  return {
    ...base(x, y),
    type: 'stroke',
    points,
    strokeWidth: style.strokeWidth,
    color: style.strokeColor,
    ...outlineStyle(style),
  };
}

export function createLine(
  x: number,
  y: number,
  points: number[],
  style: ItemStyle = DEFAULT_ITEM_STYLE,
): LineShape {
  return {
    ...base(x, y),
    type: 'line',
    points,
    strokeWidth: style.strokeWidth,
    color: style.strokeColor,
    ...outlineStyle(style),
  };
}

export function createImage(x: number, y: number, src: string, width: number, height: number): ImageShape {
  return { ...base(x, y), type: 'image', src, width, height };
}

export function createSticky(x: number, y: number): StickyShape {
  return {
    ...base(x, y),
    type: 'sticky',
    text: '',
    color: STICKY_COLORS[0],
    width: STICKY_DEFAULT_SIZE,
    height: STICKY_DEFAULT_SIZE,
  };
}

// points stores the pair chosen at creation time for schema completeness —
// rendering always recomputes live from fromShapeId/toShapeId instead of
// reading this back (see geometry.ts's getArrowEndpoints).
export function createArrow(
  fromShape: Shape,
  toShape: Shape,
  style: ItemStyle = DEFAULT_ITEM_STYLE,
): ArrowShape {
  const { from, to } = nearestAnchorPair(fromShape, toShape);
  return {
    ...base(from.x, from.y),
    type: 'arrow',
    fromShapeId: fromShape.id,
    toShapeId: toShape.id,
    points: [from.x, from.y, to.x, to.y],
    strokeWidth: style.strokeWidth,
    ...outlineStyle(style),
  };
}
