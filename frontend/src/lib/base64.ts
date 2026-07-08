// Manual base64 <-> Uint8Array conversion. Avoids spreading large arrays
// into String.fromCharCode (call-stack limits), and avoids depending on
// Node's Buffer, which isn't reliably available in the browser.
const CHUNK_SIZE = 0x8000; // 32KB

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
