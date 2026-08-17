// A PNG reader narrow enough to be trustworthy: it decodes exactly the shape Flight's captures produce
// and REFUSES everything else. Used to verify a fresh capture against a blessed reference image
// (agents/render-oracle-repository.md §2), where the comparison must happen in Node.
//
// ★ WHY NOT THE BROWSER PATH. `captureScreenshotHash` decodes in-page via `createImageBitmap`, and its
// digest is over `"<width>x<height>:"` + the browser's pixels — which may carry colour conversion or
// alpha premultiplication applied by the decoder. `flight-reference-images` computes `sha256(decoded top-down
// RGBA8)` with no prefix and no browser. THE TWO HASHES ARE NOT COMPARABLE, and neither is wrong: they
// answer to different consumers. This module produces the second, so Flight can check its own capture
// against a pack manifest without a browser in the loop.
//
// ★ WHY NOT A DEPENDENCY. This is the only PNG decode Flight needs outside a page, over images it
// produced itself at a fixed shape. A narrow reader that hard-fails on anything unexpected is safer here
// than a general one: a general decoder handles a surprise by decoding it SOMEHOW, and a wrong decode
// yields a wrong hash — a false regression or, worse, a false pass. Refusing is a verdict; guessing is not.
//
// The chunk layout, filter types and their predictors are facts about the format, stated as such: an
// 8-byte signature, then length/type/data/CRC chunks; IHDR carries width, height, bit depth, colour type,
// compression, filter and interlace; IDAT data is a zlib stream of scanlines each prefixed by a filter
// byte. No reference implementation was consulted or transcribed.
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export interface DecodedPng {
  width: number;
  height: number;
  /** Top-down, 8 bits per channel, RGBA, unpremultiplied — exactly the bytes the pack manifest hashes. */
  data: Uint8Array;
}

export type PngRefusal =
  | 'not-a-png'
  | 'truncated'
  | 'unsupported-bit-depth'
  | 'unsupported-color-type'
  | 'unsupported-compression'
  | 'unsupported-filter-method'
  | 'interlaced'
  | 'no-image-data'
  | 'bad-filter-type'
  | 'size-mismatch';

export type PngResult = { png: DecodedPng } | { refused: PngRefusal };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The one decoded-pixel identity shared by request, lock, pack manifest, and comparison. */
export function getOraclePngPixelSha256(
  bytes: Readonly<Uint8Array>,
): { pixelSha256: string } | { refused: PngRefusal } {
  const decoded = decodeOraclePng(bytes);
  if ('refused' in decoded) return decoded;
  return { pixelSha256: hashOraclePixelBytes(decoded.png.data) };
}

export function hashOraclePixelBytes(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Decodes a non-interlaced 8-bit RGBA PNG. Any other variant is refused by name rather than approximated.
 */
export function decodeOraclePng(bytes: Readonly<Uint8Array>): PngResult {
  if (bytes.length < 8 + 25) return { refused: 'truncated' };
  for (const [index, expected] of SIGNATURE.entries()) if (bytes[index] !== expected) return { refused: 'not-a-png' };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) return { refused: 'truncated' };

    if (type === 'IHDR') {
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      if (bytes[dataStart + 8] !== 8) return { refused: 'unsupported-bit-depth' };
      if (bytes[dataStart + 9] !== 6) return { refused: 'unsupported-color-type' };
      if (bytes[dataStart + 10] !== 0) return { refused: 'unsupported-compression' };
      if (bytes[dataStart + 11] !== 0) return { refused: 'unsupported-filter-method' };
      // Adam7 would need a second, differently-shaped path. Flight never produces one, so it is refused
      // rather than carried as untested code that only runs on an image nobody meant to bless.
      if (bytes[dataStart + 12] !== 0) return { refused: 'interlaced' };
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4;
  }

  if (idat.length === 0 || width === 0 || height === 0) return { refused: 'no-image-data' };

  const compressed = concat(idat);
  const raw = new Uint8Array(inflateSync(compressed));
  const bpp = 4;
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) return { refused: 'size-mismatch' };

  const data = new Uint8Array(height * stride);
  let source = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[source++]!;
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[source + x]!;
      // a = byte bpp to the left, b = byte above, c = byte above-left; 0 outside the image.
      const a = x >= bpp ? data[row + x - bpp]! : 0;
      const b = y > 0 ? data[previous + x]! : 0;
      const c = x >= bpp && y > 0 ? data[previous + x - bpp]! : 0;
      let out: number;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + a;
          break;
        case 2:
          out = value + b;
          break;
        case 3:
          out = value + ((a + b) >> 1);
          break;
        case 4:
          out = value + paeth(a, b, c);
          break;
        default:
          return { refused: 'bad-filter-type' };
      }
      data[row + x] = out & 0xff;
    }
    source += stride;
  }

  return { png: { data, height, width } };
}

/** The PNG Paeth predictor: whichever of left, above, or above-left is nearest to a + b − c. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
