import { shapeGraphToSvg } from './thumbnail';
import type { Shape } from './types';

// Build a fitted SVG of the whole board (independent of the current pan/zoom)
// by reusing the shared serializer that also powers list thumbnails and the
// MCP snapshot. Arrows need the full graph to look up their live endpoints.
function toGraph(shapes: Shape[]): Record<string, Shape> {
  const graph: Record<string, Shape> = {};
  for (const s of shapes) graph[s.id] = s;
  return graph;
}

export function boardToSvg(shapes: Shape[], background: string): string {
  return shapeGraphToSvg(toGraph(shapes), { background });
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadSvg(shapes: Shape[], background: string, filename = 'board.svg') {
  const svg = boardToSvg(shapes, background);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Rasterises the SVG onto an offscreen canvas so PNG export is viewport- and
// device-pixel-ratio independent. Returns a PNG blob.
async function boardToPngBlob(shapes: Shape[], background: string, scale = 2): Promise<Blob> {
  const svg = boardToSvg(shapes, background);
  const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to rasterise board SVG'));
    img.src = svgUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export async function downloadPng(shapes: Shape[], background: string, filename = 'board.png') {
  const blob = await boardToPngBlob(shapes, background);
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyPngToClipboard(shapes: Shape[], background: string): Promise<void> {
  const blob = await boardToPngBlob(shapes, background);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
