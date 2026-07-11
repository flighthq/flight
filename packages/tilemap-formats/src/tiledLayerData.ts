import type { TiledCompression, TiledInflate } from './tiledOptions';

// Decodes the two textual encodings Tiled uses for a tile layer's `<data>`/`data` payload into a flat
// array of raw 32-bit GIDs (row-major, flip bits intact). The `xml`/array forms are handled inline by
// the parsers; these two cover the encoded strings shared by TMX and TMJ.

// Decodes a base64 layer payload into raw GIDs. Each tile is a little-endian unsigned 32-bit int.
// When `compression` is non-null the base64 bytes are first passed through `inflate`; returns null
// when a compressed payload has no `inflate` seam or `inflate` fails to decode it — the caller then
// treats the layer as empty rather than dropping it.
export function decodeTiledBase64Layer(
  text: string,
  compression: TiledCompression | null,
  inflate?: TiledInflate,
): Uint32Array | null {
  let bytes = decodeBase64(text);
  if (compression !== null) {
    if (inflate === undefined) return null;
    const inflated = inflate(bytes, compression);
    if (inflated === null) return null;
    bytes = inflated;
  }
  const count = bytes.length >>> 2;
  const gids = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const b = i * 4;
    gids[i] = (bytes[b] | (bytes[b + 1] << 8) | (bytes[b + 2] << 16) | (bytes[b + 3] << 24)) >>> 0;
  }
  return gids;
}

// Decodes a CSV layer payload (`"1,2,0,5"`, whitespace and newlines ignored) into raw GIDs. Blank
// entries are skipped; a non-numeric entry becomes 0 (empty).
export function decodeTiledCsvLayer(text: string): Uint32Array {
  const out: number[] = [];
  for (const part of text.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const n = Number(trimmed);
    out.push(Number.isFinite(n) ? n >>> 0 : 0);
  }
  return Uint32Array.from(out);
}

// Portable base64 decode that works in Node.js (Vitest) and browsers alike, avoiding the
// browser-only atob() global. Non-base64 characters (whitespace, newlines) are stripped first.
function decodeBase64(s: string): Uint8Array {
  const stripped = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < stripped.length; i += 4) {
    const c0 = BASE64_TABLE.indexOf(stripped[i]);
    const c1 = BASE64_TABLE.indexOf(stripped[i + 1]);
    const c2 = i + 2 < stripped.length ? BASE64_TABLE.indexOf(stripped[i + 2]) : -1;
    const c3 = i + 3 < stripped.length ? BASE64_TABLE.indexOf(stripped[i + 3]) : -1;
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    out.push((n >> 16) & 0xff);
    if (c2 >= 0) out.push((n >> 8) & 0xff);
    if (c3 >= 0) out.push(n & 0xff);
  }
  return new Uint8Array(out);
}

const BASE64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
