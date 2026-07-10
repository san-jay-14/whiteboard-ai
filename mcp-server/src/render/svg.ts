// Server-side equivalent of the frontend Konva layer
// (frontend/src/components/ShapeRenderer.tsx): turns a board's shape_graph
// into an SVG string. Kept isolated so the visual mapping (colors, stroke
// widths, arrow rendering) can be re-synced if the frontend changes.
//
// Same conventions as Konva: rect/sticky (x,y) = top-left and rotate about
// it; ellipse (x,y) = center and rotate about it; stroke points are relative
// to (x,y); arrows recompute endpoints live from the connected shapes.
import type { Shape, ShapeGraph } from '../shapes/types.js';
import { getArrowEndpoints, getRotatedAABB, type Anchor, type Bounds } from '../shapes/geometry.js';

const CANVAS_BG = '#f5f5f5'; // matches the frontend bg-neutral-100
const TEXT_FILL = '#1f2937';
const ARROW_COLOR = '#1f2937';
const PADDING = 40;
const ARROW_POINTER_LENGTH = 10;
const ARROW_POINTER_WIDTH = 10;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rotateAttr(shape: Shape): string {
  const rotation = shape.rotation ?? 0;
  if (!rotation) return '';
  return ` transform="rotate(${rotation} ${shape.x} ${shape.y})"`;
}

function strokeW(shape: Shape): number {
  return shape.strokeWidth ?? 2;
}

function dashAttr(shape: Shape): string {
  // AI proposals (step 10+) render dashed/pending in the frontend; mirror it
  // here so the image stays representative once such shapes exist. Otherwise
  // honour the shape's own strokeStyle.
  if (shape.pendingReview) return ' stroke-dasharray="6 4"';
  const w = strokeW(shape);
  if (shape.strokeStyle === 'dashed') return ` stroke-dasharray="${w * 4} ${w * 2.5}"`;
  if (shape.strokeStyle === 'dotted') return ` stroke-dasharray="${w} ${w * 2}"`;
  return '';
}

function opacityAttr(shape: Shape): string {
  const o = shape.opacity ?? 100;
  return o < 100 ? ` opacity="${o / 100}"` : '';
}

function renderRect(shape: Extract<Shape, { type: 'rect' }>): string {
  const round = shape.edges === 'round' ? ' rx="12"' : '';
  return (
    `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${round} ` +
    `fill="${esc(shape.fill)}" stroke="${esc(shape.stroke)}" stroke-width="${strokeW(shape)}"` +
    `${dashAttr(shape)}${opacityAttr(shape)}${rotateAttr(shape)} />`
  );
}

function renderDiamond(shape: Extract<Shape, { type: 'diamond' }>): string {
  const { x, y, width: w, height: h } = shape;
  const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
  return (
    `<polygon points="${pts}" fill="${esc(shape.fill)}" stroke="${esc(shape.stroke)}" ` +
    `stroke-width="${strokeW(shape)}"${dashAttr(shape)}${opacityAttr(shape)}${rotateAttr(shape)} />`
  );
}

function renderEllipse(shape: Extract<Shape, { type: 'ellipse' }>): string {
  return (
    `<ellipse cx="${shape.x}" cy="${shape.y}" rx="${shape.radiusX}" ry="${shape.radiusY}" ` +
    `fill="${esc(shape.fill)}" stroke="${esc(shape.stroke)}" stroke-width="${strokeW(shape)}"` +
    `${dashAttr(shape)}${opacityAttr(shape)}${rotateAttr(shape)} />`
  );
}

function renderLine(shape: Extract<Shape, { type: 'line' }>): string {
  const pts: string[] = [];
  for (let i = 0; i + 1 < shape.points.length; i += 2) {
    pts.push(`${shape.x + shape.points[i]},${shape.y + shape.points[i + 1]}`);
  }
  return (
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${esc(shape.color)}" ` +
    `stroke-width="${shape.strokeWidth}" stroke-linecap="round"${dashAttr(shape)}${opacityAttr(shape)} />`
  );
}

function renderText(shape: Extract<Shape, { type: 'text' }>): string {
  // Konva positions text by top-left; SVG <text> y is the baseline, so shift
  // down by ~0.8em to approximate the same top.
  const baseline = shape.y + shape.fontSize * 0.8;
  return (
    `<text x="${shape.x}" y="${baseline}" font-family="sans-serif" font-size="${shape.fontSize}" ` +
    `fill="${TEXT_FILL}">${esc(shape.text)}</text>`
  );
}

function renderStroke(shape: Extract<Shape, { type: 'stroke' }>): string {
  const pts: string[] = [];
  for (let i = 0; i + 1 < shape.points.length; i += 2) {
    pts.push(`${shape.x + shape.points[i]},${shape.y + shape.points[i + 1]}`);
  }
  return (
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${esc(shape.color)}" ` +
    `stroke-width="${shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr(shape)} />`
  );
}

function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length === 0) {
      line = word;
    } else if ((line + ' ' + word).length <= maxChars) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderSticky(shape: Extract<Shape, { type: 'sticky' }>): string {
  const fontSize = 14;
  const padding = 8;
  const parts: string[] = [];
  parts.push(`<g${rotateAttr(shape)}>`);
  parts.push(
    `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" ` +
      `fill="${esc(shape.color)}" stroke="rgba(0,0,0,0.15)" stroke-width="1"${dashAttr(shape)} />`,
  );
  if (shape.text) {
    const maxChars = Math.max(4, Math.floor((shape.width - padding * 2) / (fontSize * 0.55)));
    const lines = wrapText(shape.text, maxChars);
    const tx = shape.x + padding;
    let ty = shape.y + padding + fontSize * 0.8;
    for (const line of lines) {
      if (ty > shape.y + shape.height - 2) break; // clip overflow
      parts.push(
        `<text x="${tx}" y="${ty}" font-family="sans-serif" font-size="${fontSize}" fill="${TEXT_FILL}">${esc(line)}</text>`,
      );
      ty += fontSize * 1.3;
    }
  }
  parts.push('</g>');
  return parts.join('');
}

function renderArrow(from: Anchor, to: Anchor, pending: boolean): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  const baseX = to.x - ARROW_POINTER_LENGTH * dx;
  const baseY = to.y - ARROW_POINTER_LENGTH * dy;
  const half = ARROW_POINTER_WIDTH / 2;
  const b1 = `${baseX + px * half},${baseY + py * half}`;
  const b2 = `${baseX - px * half},${baseY - py * half}`;
  const dash = pending ? ' stroke-dasharray="6 4"' : '';
  return (
    `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${ARROW_COLOR}" stroke-width="2"${dash} />` +
    `<polygon points="${to.x},${to.y} ${b1} ${b2}" fill="${ARROW_COLOR}" />`
  );
}

function shapeAABB(shape: Shape, graph: ShapeGraph): Bounds | null {
  if (shape.type === 'arrow') {
    const endpoints = getArrowEndpoints(shape, graph);
    if (!endpoints) return null;
    const { from, to } = endpoints;
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
  }
  return getRotatedAABB(shape);
}

function computeViewBox(shapes: Shape[], graph: ShapeGraph): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const b = shapeAABB(shape, graph);
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 480, height: 320 };
  }
  return {
    x: minX - PADDING,
    y: minY - PADDING,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
}

// Renders sorted by (z, createdAt), matching the frontend's z-order.
export function shapeGraphToSvg(graph: ShapeGraph): string {
  const shapes = Object.values(graph).sort(
    (a, b) => (a.z ?? 0) - (b.z ?? 0) || a.createdAt - b.createdAt,
  );
  const vb = computeViewBox(shapes, graph);

  const body: string[] = [];
  for (const shape of shapes) {
    switch (shape.type) {
      case 'rect':
        body.push(renderRect(shape));
        break;
      case 'diamond':
        body.push(renderDiamond(shape));
        break;
      case 'line':
        body.push(renderLine(shape));
        break;
      case 'ellipse':
        body.push(renderEllipse(shape));
        break;
      case 'text':
        body.push(renderText(shape));
        break;
      case 'stroke':
        body.push(renderStroke(shape));
        break;
      case 'sticky':
        body.push(renderSticky(shape));
        break;
      case 'arrow': {
        const endpoints = getArrowEndpoints(shape, graph);
        if (endpoints) body.push(renderArrow(endpoints.from, endpoints.to, !!shape.pendingReview));
        break;
      }
    }
  }

  const empty =
    shapes.length === 0
      ? `<text x="${vb.x + vb.width / 2}" y="${vb.y + vb.height / 2}" font-family="sans-serif" font-size="18" ` +
        `fill="#9ca3af" text-anchor="middle">Empty board</text>`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vb.width)}" height="${Math.round(vb.height)}" ` +
    `viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}">` +
    `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="${CANVAS_BG}" />` +
    body.join('') +
    empty +
    `</svg>`
  );
}
