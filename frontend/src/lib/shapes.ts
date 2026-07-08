import type { EllipseShape, RectShape, StrokeShape, TextShape } from './types';

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

export function createRect(x: number, y: number, width: number, height: number): RectShape {
  return { ...base(x, y), type: 'rect', width, height, fill: '#38bdf8', stroke: '#0369a1' };
}

export function createEllipse(x: number, y: number, radiusX: number, radiusY: number): EllipseShape {
  return { ...base(x, y), type: 'ellipse', radiusX, radiusY, fill: '#facc15', stroke: '#a16207' };
}

export function createText(x: number, y: number, text: string): TextShape {
  return { ...base(x, y), type: 'text', text, fontSize: 20 };
}

export function createStroke(x: number, y: number, points: number[]): StrokeShape {
  return { ...base(x, y), type: 'stroke', points, strokeWidth: 3, color: '#111827' };
}
