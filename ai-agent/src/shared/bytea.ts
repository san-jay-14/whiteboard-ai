// VENDORED COPY of /shared/bytea.ts — see shared/transport.ts here for why.
// Mirror any change to /shared/bytea.ts.
//
// Postgres `bytea` <-> Uint8Array helpers. board_snapshots.yjs_state is a
// bytea column; PostgREST sends/receives it as a hex string in the
// `\x<hex>` format (the default bytea_output).

export function bytesToByteaHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `\\x${hex}`;
}

export function byteaHexToBytes(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
