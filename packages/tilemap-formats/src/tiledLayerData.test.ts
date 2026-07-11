import { describe, expect, it } from 'vitest';

import { decodeTiledBase64Layer, decodeTiledCsvLayer } from './tiledLayerData';

// GIDs [1, 5, 0x80000001, 6] as little-endian 32-bit ints.
const gids = [1, 5, 0x80000001, 6];
const bytes = new Uint8Array(gids.length * 4);
const view = new DataView(bytes.buffer);
gids.forEach((gid, i) => view.setUint32(i * 4, gid, true));
const base64 = encodeBase64(bytes);

// Portable base64 encoder for fixtures (avoids depending on Node's Buffer in the type-check).
function encodeBase64(input: Readonly<Uint8Array>): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const b0 = input[i];
    const b1 = i + 1 < input.length ? input[i + 1] : 0;
    const b2 = i + 2 < input.length ? input[i + 2] : 0;
    out += table[b0 >> 2] + table[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < input.length ? table[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < input.length ? table[b2 & 63] : '=';
  }
  return out;
}

describe('decodeTiledBase64Layer', () => {
  it('decodes an uncompressed base64 payload as little-endian GIDs', () => {
    expect(Array.from(decodeTiledBase64Layer(base64, null)!)).toEqual(gids);
  });

  it('agrees with the CSV decode of the same GIDs', () => {
    expect(Array.from(decodeTiledBase64Layer(base64, null)!)).toEqual(
      Array.from(decodeTiledCsvLayer('1,5,2147483649,6')),
    );
  });

  it('returns null when compressed with no inflate seam', () => {
    expect(decodeTiledBase64Layer(base64, 'gzip')).toBeNull();
  });

  it('decodes through an inflate seam when supplied', () => {
    const inflate = (input: Readonly<Uint8Array>) => new Uint8Array(input);
    expect(Array.from(decodeTiledBase64Layer(base64, 'gzip', inflate)!)).toEqual(gids);
  });

  it('returns null when the inflate seam fails', () => {
    expect(decodeTiledBase64Layer(base64, 'zlib', () => null)).toBeNull();
  });
});

describe('decodeTiledCsvLayer', () => {
  it('parses comma-separated GIDs and ignores whitespace', () => {
    expect(Array.from(decodeTiledCsvLayer('\n1, 5,\n2147483649, 6\n'))).toEqual(gids);
  });
});
