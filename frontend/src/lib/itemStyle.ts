import type { Edges, FontFamily, Shape, StrokeStyle, TextAlign } from './types';

// The "current item style" — Excalidraw's model where the left panel edits a
// live set of defaults that seed every new shape (and persist across
// sessions). Selecting shapes and changing a property both writes the shapes
// and updates this default.
export type ItemStyle = {
  strokeColor: string;
  backgroundColor: string; // 'transparent' or a hex color
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  edges: Edges;
  opacity: number; // 0–100
  fontFamily: FontFamily;
  fontSize: number;
  textAlign: TextAlign;
};

// CSS font-family stack for each stored fontFamily token — shared by the
// Konva text renderer and the inline HTML text editor so they match exactly.
export const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  hand: '"Comic Sans MS", "Segoe Print", cursive',
  normal: 'Helvetica, Arial, sans-serif',
  code: '"Cascadia Code", "Fira Code", monospace',
};

export const DEFAULT_ITEM_STYLE: ItemStyle = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  strokeWidth: 2,
  strokeStyle: 'solid',
  edges: 'round',
  opacity: 100,
  fontFamily: 'hand',
  fontSize: 20,
  textAlign: 'left',
};

// Excalidraw's default palettes.
export const STROKE_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
export const BACKGROUND_COLORS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];
export const STROKE_WIDTHS = [1, 2, 4] as const; // thin / bold / extra-bold
export const FONT_SIZES = [16, 20, 28, 36] as const; // S / M / L / XL

const STORAGE_KEY = 'wb:itemStyle';

export function loadItemStyle(): ItemStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_ITEM_STYLE, ...(JSON.parse(raw) as Partial<ItemStyle>) };
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_ITEM_STYLE;
}

export function saveItemStyle(style: ItemStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
  } catch {
    // storage unavailable — non-fatal
  }
}

// Light-on-dark default stroke. When the strokeColor is still the theme's
// default black/white, flip it to match the active theme so freshly drawn
// shapes stay visible on the dark canvas (an explicitly-picked colour is left
// untouched).
const LIGHT_DEFAULT_STROKE = '#1e1e1e';
const DARK_DEFAULT_STROKE = '#e9e9e9';
export function themedStyle(style: ItemStyle, dark: boolean): ItemStyle {
  if (dark && style.strokeColor === LIGHT_DEFAULT_STROKE) return { ...style, strokeColor: DARK_DEFAULT_STROKE };
  if (!dark && style.strokeColor === DARK_DEFAULT_STROKE) return { ...style, strokeColor: LIGHT_DEFAULT_STROKE };
  return style;
}

// Which ItemStyle properties are meaningful for a given shape type — drives
// both which panel sections show and which patch fields get applied.
export function shapeSupportsFill(type: Shape['type']): boolean {
  return type === 'rect' || type === 'ellipse' || type === 'diamond' || type === 'sticky';
}
export function shapeSupportsStroke(type: Shape['type']): boolean {
  return type !== 'sticky';
}
export function shapeSupportsEdges(type: Shape['type']): boolean {
  return type === 'rect' || type === 'diamond';
}
export function shapeSupportsStrokeWidth(type: Shape['type']): boolean {
  return type !== 'text' && type !== 'sticky';
}

// Maps the changed ItemStyle fields onto the correct per-shape fields. `any`
// is used to sidestep discriminated-union narrowing across many branches;
// every write targets a field that genuinely exists on that variant.
export function applyStylePatch(shape: Shape, patch: Partial<ItemStyle>): Shape {
  const next = { ...shape } as Record<string, unknown>;
  if (patch.strokeColor !== undefined && shapeSupportsStroke(shape.type)) {
    if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'diamond') next.stroke = patch.strokeColor;
    else if (shape.type === 'stroke' || shape.type === 'line' || shape.type === 'text') next.color = patch.strokeColor;
  }
  if (patch.backgroundColor !== undefined) {
    if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'diamond') next.fill = patch.backgroundColor;
    else if (shape.type === 'sticky') next.color = patch.backgroundColor;
  }
  if (patch.strokeWidth !== undefined && shapeSupportsStrokeWidth(shape.type)) next.strokeWidth = patch.strokeWidth;
  if (patch.strokeStyle !== undefined && shapeSupportsStroke(shape.type)) next.strokeStyle = patch.strokeStyle;
  if (patch.edges !== undefined && shapeSupportsEdges(shape.type)) next.edges = patch.edges;
  if (patch.opacity !== undefined) next.opacity = patch.opacity;
  if (shape.type === 'text') {
    if (patch.fontSize !== undefined) next.fontSize = patch.fontSize;
    if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily;
    if (patch.textAlign !== undefined) next.textAlign = patch.textAlign;
  }
  return next as unknown as Shape;
}

// Reads a shape's current styling back into ItemStyle fields, so the panel
// reflects the actual selected shape rather than the drawing defaults.
export function deriveItemStyle(shape: Shape): Partial<ItemStyle> {
  const out: Partial<ItemStyle> = {};
  if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'diamond') {
    out.strokeColor = shape.stroke;
    out.backgroundColor = shape.fill;
  } else if (shape.type === 'stroke' || shape.type === 'line') {
    out.strokeColor = shape.color;
  } else if (shape.type === 'text') {
    out.strokeColor = shape.color;
    out.fontSize = shape.fontSize;
  } else if (shape.type === 'sticky') {
    out.backgroundColor = shape.color;
  }
  if (shape.strokeWidth !== undefined) out.strokeWidth = shape.strokeWidth;
  if (shape.strokeStyle !== undefined) out.strokeStyle = shape.strokeStyle;
  if (shape.edges !== undefined) out.edges = shape.edges;
  if (shape.opacity !== undefined) out.opacity = shape.opacity;
  if (shape.fontFamily !== undefined) out.fontFamily = shape.fontFamily;
  if (shape.textAlign !== undefined) out.textAlign = shape.textAlign;
  return out;
}
