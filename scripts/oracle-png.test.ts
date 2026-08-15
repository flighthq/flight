import { deflateSync } from 'node:zlib';

import { decodeOraclePng } from './oracle-png';

// ★ GROUND TRUTH IS THE PIXELS THE TEST ENCODED, NOT ANOTHER DECODER'S OPINION OF THEM. Each case builds
// a PNG from known bytes under a chosen filter, so a passing decode means the original pixels came back —
// not that two implementations agree about something neither can check.
//
// The decoder was additionally validated against `flight-oracles`' own independent implementation: it
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

  it('refuses a colour type it does not implement', () => {
    // Colour type 2 is RGB without alpha: a real PNG, three bytes per pixel, which this decoder would
    // otherwise unfilter at the wrong stride and hash as plausible garbage.
    expect(decodeOraclePng(png(2, 2, new Uint8Array(16), 0, { colorType: 2 }))).toEqual({
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

/** Builds a PNG from raw RGBA, applying one filter type to every scanline. Format facts only. */
function png(
  width: number,
  height: number,
  pixels: Readonly<Uint8Array>,
  filter: number,
  options: { bitDepth?: number; colorType?: number; interlace?: number; omitIdat?: boolean } = {},
): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const value = pixels[y * stride + x] ?? 0;
      const a = x >= 4 ? (pixels[y * stride + x - 4] ?? 0) : 0;
      const b = y > 0 ? (pixels[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= 4 && y > 0 ? (pixels[(y - 1) * stride + x - 4] ?? 0) : 0;
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
  ihdr[9] = options.colorType ?? 6;
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
