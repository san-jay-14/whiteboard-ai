// Display-time contrast adjustment so shapes stay visible when the theme is
// toggled. Only near-grayscale colours (black/white/gray strokes) are
// remapped — colours with an actual hue are left alone, since a red or blue
// stroke reads fine on either background. This mirrors Excalidraw, where the
// stored colour never changes; only what's painted adapts to the theme.

function parseHex(color: string): { r: number; g: number; b: number } | null {
  let c = color.trim();
  if (c[0] !== '#') return null;
  c = c.slice(1);
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  if (c.length !== 6) return null;
  const n = Number.parseInt(c, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function adjustColorForTheme(color: string, dark: boolean): string {
  if (!color || color === 'transparent') return color;
  const rgb = parseHex(color);
  if (!rgb) return color;
  const { r, g, b } = rgb;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma > 32) return color; // has a real hue — leave it
  const lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0..255
  // Dark theme: lift dark grays to light. Light theme: drop light grays to
  // dark. Each only touches colours that would otherwise vanish.
  if (dark && lum < 128) return toHex(255 - lum, 255 - lum, 255 - lum);
  if (!dark && lum > 200) return toHex(255 - lum, 255 - lum, 255 - lum);
  return color;
}
