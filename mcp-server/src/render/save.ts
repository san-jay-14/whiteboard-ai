import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exec } from 'node:child_process';

// Claude Desktop doesn't render MCP image content blocks inline in the
// chat, so for a human to actually *see* a snapshot we write the PNG to
// disk and open it in the OS default image viewer.
//
// Output dir: SNAPSHOT_DIR env, else <tmp>/whiteboard-snapshots.
// Auto-open: on unless SNAPSHOT_AUTO_OPEN=false.
const OUTPUT_DIR = process.env.SNAPSHOT_DIR || join(tmpdir(), 'whiteboard-snapshots');
const AUTO_OPEN = process.env.SNAPSHOT_AUTO_OPEN !== 'false';

function openInViewer(path: string): void {
  const platform = process.platform;
  const cmd =
    platform === 'win32'
      ? `start "" "${path}"`
      : platform === 'darwin'
        ? `open "${path}"`
        : `xdg-open "${path}"`;
  // Fire-and-forget; a viewer that fails to launch shouldn't fail the tool.
  exec(cmd, () => {});
}

export type SavedSnapshot = { path: string; opened: boolean };

export function savePng(base64: string, boardId: string): SavedSnapshot {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  // One file per board, overwritten each call — no clutter, always latest.
  const path = join(OUTPUT_DIR, `board-${boardId}.png`);
  writeFileSync(path, Buffer.from(base64, 'base64'));
  if (AUTO_OPEN) openInViewer(path);
  return { path, opened: AUTO_OPEN };
}
