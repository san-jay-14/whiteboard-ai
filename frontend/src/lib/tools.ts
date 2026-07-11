import type { Tool } from '../components/Toolbar';

// Maps a lowercased key to a tool, for the global keyboard-shortcut handler
// in Canvas. Kept out of Toolbar.tsx so that file only exports its component
// (React Fast Refresh requirement).
export const TOOL_SHORTCUTS: Record<string, Tool> = {
  h: 'hand',
  v: 'select',
  '1': 'select',
  r: 'rect',
  '2': 'rect',
  d: 'diamond',
  '3': 'diamond',
  o: 'ellipse',
  '4': 'ellipse',
  a: 'arrow',
  '5': 'arrow',
  l: 'line',
  '6': 'line',
  p: 'pen',
  '7': 'pen',
  t: 'text',
  '8': 'text',
  i: 'image',
  '9': 'image',
  s: 'sticky',
  e: 'eraser',
  '0': 'eraser',
};
