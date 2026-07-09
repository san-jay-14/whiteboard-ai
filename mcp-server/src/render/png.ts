import { Resvg } from '@resvg/resvg-js';

// Rasterizes an SVG string to a base64 PNG. resvg is a native (Rust) SVG
// renderer with prebuilt platform binaries — no browser/canvas needed.
export function svgToPngBase64(svg: string): string {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  });
  const png = resvg.render().asPng();
  return Buffer.from(png).toString('base64');
}
