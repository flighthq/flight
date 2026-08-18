import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { decodeOraclePng, getOraclePngPixelSha256, hashOraclePixelBytes } from './reference-image-png';

// ★ GROUND TRUTH IS THE PIXELS THE TEST ENCODED, NOT ANOTHER DECODER'S OPINION OF THEM. Each case builds
// a PNG from known bytes under a chosen filter, so a passing decode means the original pixels came back —
// not that two implementations agree about something neither can check.
//
// The decoder was additionally validated against `flight-reference-images`' own independent implementation: it
// reproduced the published `pixelSha256` of the first blessed pack exactly. That is the check no
// synthetic fixture can make, and it is why the two hashes in the pipeline can now be trusted to agree.

describe('decodeOraclePng', () => {
  it('decodes an unfiltered image back to the pixels it was built from', () => {
    const pixels = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]);
    const result = decodeOraclePng(png(2, 2, pixels, 0));

    expect('png' in result && Array.from(result.png.data)).toEqual(Array.from(pixels));
  });

  it.each([
    ['Sub', 1],
    ['Up', 2],
    ['Average', 3],
    ['Paeth', 4],
  ])('reverses the %s filter', (_name, filter) => {
    const pixels = new Uint8Array([9, 40, 200, 255, 30, 60, 90, 255, 12, 24, 36, 255, 200, 100, 50, 255]);
    const result = decodeOraclePng(png(2, 2, pixels, filter));

    expect('png' in result && Array.from(result.png.data)).toEqual(Array.from(pixels));
  });

  it('reports the dimensions from IHDR', () => {
    const result = decodeOraclePng(png(2, 2, new Uint8Array(16), 0));

    expect('png' in result && [result.png.width, result.png.height]).toEqual([2, 2]);
  });

  it('decodes the measured type-2 DOM capture to opaque RGBA', () => {
    expect(createHash('sha256').update(DOM_TYPE_2_CAPTURE).digest('hex')).toBe(
      'c7bc1c2d9d70795d3388f7c526f75cca16a3a662a784961cc9f9faf0f8d5b116',
    );
    expect(DOM_TYPE_2_CAPTURE[25]).toBe(2);

    const result = decodeOraclePng(DOM_TYPE_2_CAPTURE);
    if ('refused' in result) throw new Error(`capture was refused: ${result.refused}`);

    expect([result.png.width, result.png.height]).toEqual([800, 600]);
    expect(result.png.data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
    expect(pixel(result.png.data, result.png.width, 10, 10)).toEqual([0, 0, 255, 255]);
    expect(pixel(result.png.data, result.png.width, 240, 300)).toEqual([253, 253, 255, 255]);
    expect(pixel(result.png.data, result.png.width, 560, 300)).toEqual([126, 126, 255, 255]);
  });

  // ★ EVERY REFUSAL IS NAMED. A general decoder handles a surprise by decoding it somehow, and a wrong
  // decode is a wrong hash — a false regression, or a false pass on a reference nobody meant to bless.
  it('refuses bytes that are not a PNG', () => {
    expect(decodeOraclePng(new Uint8Array(64))).toEqual({ refused: 'not-a-png' });
  });

  it('refuses a truncated file rather than decoding a partial image', () => {
    expect(decodeOraclePng(png(2, 2, new Uint8Array(16), 0).subarray(0, 20))).toEqual({ refused: 'truncated' });
  });

  it('refuses a bit depth it does not implement', () => {
    expect(decodeOraclePng(png(2, 2, new Uint8Array(16), 0, { bitDepth: 16 }))).toEqual({
      refused: 'unsupported-bit-depth',
    });
  });

  it.each([0, 3, 4])('refuses unmeasured colour type %i', (colorType) => {
    expect(decodeOraclePng(png(2, 2, new Uint8Array(16), 0, { colorType }))).toEqual({
      refused: 'unsupported-color-type',
    });
  });

  it('refuses an interlaced image instead of decoding it as progressive', () => {
    expect(decodeOraclePng(png(2, 2, new Uint8Array(16), 0, { interlace: 1 }))).toEqual({ refused: 'interlaced' });
  });

  it('refuses an unknown filter type', () => {
    expect(decodeOraclePng(png(2, 2, new Uint8Array(16), 9))).toEqual({ refused: 'bad-filter-type' });
  });

  it('refuses a file with no image data', () => {
    expect(decodeOraclePng(png(2, 2, new Uint8Array(16), 0, { omitIdat: true }))).toEqual({
      refused: 'no-image-data',
    });
  });
});

describe('getOraclePngPixelSha256', () => {
  it('hashes the same opaque pixels identically as type 2 and type 6', () => {
    const pixels = new Uint8Array([1, 2, 3, 255, 40, 50, 60, 255, 70, 80, 90, 255, 200, 210, 220, 255]);
    const type2 = getOraclePngPixelSha256(png(2, 2, pixels, 4, { colorType: 2 }));
    const type6 = getOraclePngPixelSha256(png(2, 2, pixels, 4, { colorType: 6 }));

    expect(type2).toEqual(type6);
    expect(type2).toEqual({ pixelSha256: hashOraclePixelBytes(pixels) });
  });
});

/** Builds a PNG from raw RGBA, applying one filter type to every scanline. Format facts only. */
function png(
  width: number,
  height: number,
  pixels: Readonly<Uint8Array>,
  filter: number,
  options: { bitDepth?: number; colorType?: number; interlace?: number; omitIdat?: boolean } = {},
): Uint8Array {
  const colorType = options.colorType ?? 6;
  const channelCount = colorType === 2 ? 3 : 4;
  const channelPixels = new Uint8Array(width * height * channelCount);
  for (let index = 0; index < width * height; index++) {
    for (let channel = 0; channel < channelCount; channel++) {
      channelPixels[index * channelCount + channel] = pixels[index * 4 + channel] ?? 0;
    }
  }

  const stride = width * channelCount;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const value = channelPixels[y * stride + x] ?? 0;
      const a = x >= channelCount ? (channelPixels[y * stride + x - channelCount] ?? 0) : 0;
      const b = y > 0 ? (channelPixels[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= channelCount && y > 0 ? (channelPixels[(y - 1) * stride + x - channelCount] ?? 0) : 0;
      let encoded = value;
      if (filter === 1) encoded = value - a;
      else if (filter === 2) encoded = value - b;
      else if (filter === 3) encoded = value - ((a + b) >> 1);
      else if (filter === 4) encoded = value - predictor(a, b, c);
      raw[y * (stride + 1) + 1 + x] = encoded & 0xff;
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr[8] = options.bitDepth ?? 8;
  ihdr[9] = colorType;
  ihdr[12] = options.interlace ?? 0;

  const chunks = [chunk('IHDR', ihdr)];
  if (options.omitIdat !== true) chunks.push(chunk('IDAT', new Uint8Array(deflateSync(raw))));
  chunks.push(chunk('IEND', new Uint8Array(0)));

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let total = signature.length;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let at = signature.length;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function chunk(type: string, data: Readonly<Uint8Array>): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // CRC is not validated by the decoder, so a zero placeholder keeps the fixture honest about that.
  return out;
}

function predictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function pixel(data: Readonly<Uint8Array>, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return Array.from(data.subarray(offset, offset + 4));
}

// Captured from the production DOM screenshot path with:
// npm run capture:functional -- --filter-exact bitmap-transparent-compositing --renderer dom
// Encoded SHA-256: c7bc1c2d9d70795d3388f7c526f75cca16a3a662a784961cc9f9faf0f8d5b116.
const DOM_TYPE_2_CAPTURE = readFileSync(
  resolve(process.cwd(), 'scripts/fixtures/reference-image-png/bitmap-transparent-compositing-dom.png'),
);
