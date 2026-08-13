import { createBitmap } from '@flighthq/bitmap/contract';
import { getDecompressor } from '@flighthq/compression/contract';
import type { Bitmap, DecodedImage, SwfJpegAlphaPayload } from '@flighthq/types/contract';
import { Compression, CompressionFraming } from '@flighthq/types/contract';

// Joins a decoded JPEG colour plane with the separately-compressed alpha plane retained from its SWF
// definition. Decoding stays outside this pure format step: the caller chooses and awaits the image
// decoder, then hands over straight RGBA so replacing alpha cannot inherit a premultiplication based on
// the JPEG decoder's unrelated alpha bytes.
export function createSwfJpegAlphaBitmap(
  decoded: Readonly<DecodedImage>,
  payload: Readonly<SwfJpegAlphaPayload>,
): Bitmap | null {
  if (decoded.width !== payload.width || decoded.height !== payload.height) return null;
  const pixelCount = payload.width * payload.height;
  if (pixelCount <= 0 || pixelCount > MAX_PIXELS || decoded.data.length !== pixelCount * 4) return null;

  const decompress = getDecompressor(Compression.Deflate);
  if (decompress === null) return null;
  const alpha = decompress(payload.compressedAlphaBytes, pixelCount, CompressionFraming.Rfc1950);
  if (alpha === null || alpha.length !== pixelCount) return null;

  const bitmap = createBitmap(payload.width, payload.height);
  bitmap.data.set(decoded.data);
  for (let pixel = 0; pixel < pixelCount; pixel++) bitmap.data[pixel * 4 + 3] = alpha[pixel];
  return bitmap;
}

// Unpacks a lossless bitmap definition into pixels.
//
// This is the SWF half of image resolution, and it exists because the payload is not an image file. Where
// a `DefineBitsJPEG*` tag carries something a generic decoder understands, a lossless definition carries a
// raw raster of SWF's own — a format byte, dimensions, an optional colour table, then zlib-compressed rows
// — closer to a BMP than a PNG. Decompression is generic and comes from the shared registry; laying the
// decompressed bytes out as pixels is format knowledge that belongs here.
//
// Returns null when no deflate decompressor is registered or the payload does not unpack, so a caller that
// never registered one simply gets no pixels rather than an error.
export function createSwfLosslessBitmap(payload: Readonly<Uint8Array>, hasAlpha: boolean): Bitmap | null {
  const source = payload as Uint8Array;
  if (source.length < LOSSLESS_HEADER_BYTES) return null;
  const format = source[0];
  const width = source[1] + source[2] * 0x100;
  const height = source[3] + source[4] * 0x100;
  if (width === 0 || height === 0 || width * height > MAX_PIXELS) return null;

  // A colour-mapped image stores one less than its table size, and its table precedes the rows.
  const hasColorTable = format === FORMAT_COLOR_MAPPED;
  const colorCount = hasColorTable ? source[5] + 1 : 0;
  const compressed = source.subarray(LOSSLESS_HEADER_BYTES + (hasColorTable ? 1 : 0));
  const uncompressedLength = hasColorTable
    ? colorCount * (hasAlpha ? 4 : 3) + alignSwfRow(width) * height
    : format === FORMAT_15_BIT
      ? alignSwfRow(width * 2) * height
      : width * 4 * height;

  const decompress = getDecompressor(Compression.Deflate);
  if (decompress === null) return null;
  const pixels = decompress(compressed, uncompressedLength, CompressionFraming.Rfc1950);
  if (pixels === null || pixels.length !== uncompressedLength) return null;

  const bitmap = createBitmap(width, height);
  const unpacked = hasColorTable
    ? unpackSwfColorMapped(bitmap, pixels, width, height, colorCount, hasAlpha)
    : format === FORMAT_15_BIT
      ? unpackSwf15Bit(bitmap, pixels, width, height)
      : unpackSwf24Bit(bitmap, pixels, width, height, hasAlpha);
  if (!unpacked) return null;
  // Only the alpha-carrying form folds alpha into its colour channels; the others are fully opaque.
  bitmap.alphaType = hasAlpha ? 'premultiplied' : 'opaque';
  return bitmap;
}

// Each row is padded to a four-byte boundary, in every one of the three layouts.
function alignSwfRow(bytes: number): number {
  return (bytes + 3) & ~3;
}

function unpackSwfColorMapped(
  bitmap: Bitmap,
  pixels: Uint8Array,
  width: number,
  height: number,
  colorCount: number,
  hasAlpha: boolean,
): boolean {
  const entryBytes = hasAlpha ? 4 : 3;
  const tableBytes = colorCount * entryBytes;
  const stride = alignSwfRow(width);
  if (pixels.length < tableBytes + stride * height) return false;

  const out = bitmap.data;
  for (let y = 0; y < height; y++) {
    const row = tableBytes + y * stride;
    for (let x = 0; x < width; x++) {
      const entry = tableBytes === 0 ? 0 : pixels[row + x] * entryBytes;
      const target = (y * width + x) * 4;
      out[target] = pixels[entry];
      out[target + 1] = pixels[entry + 1];
      out[target + 2] = pixels[entry + 2];
      out[target + 3] = hasAlpha ? pixels[entry + 3] : 0xff;
    }
  }
  return true;
}

// Fifteen-bit pixels pack five bits per channel behind one unused bit, so each channel is scaled back up
// to eight bits rather than merely shifted, which would darken every colour.
function unpackSwf15Bit(bitmap: Bitmap, pixels: Uint8Array, width: number, height: number): boolean {
  const stride = alignSwfRow(width * 2);
  if (pixels.length < stride * height) return false;

  const out = bitmap.data;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const value = pixels[row + x * 2] * 0x100 + pixels[row + x * 2 + 1];
      const target = (y * width + x) * 4;
      out[target] = Math.round((((value >> 10) & 0x1f) * 0xff) / 0x1f);
      out[target + 1] = Math.round((((value >> 5) & 0x1f) * 0xff) / 0x1f);
      out[target + 2] = Math.round(((value & 0x1f) * 0xff) / 0x1f);
      out[target + 3] = 0xff;
    }
  }
  return true;
}

// Twenty-four-bit pixels occupy four bytes either way. Without alpha the leading byte is padding; with it,
// the same slot carries alpha and the colour channels are already multiplied by it.
function unpackSwf24Bit(bitmap: Bitmap, pixels: Uint8Array, width: number, height: number, hasAlpha: boolean): boolean {
  const stride = width * 4;
  if (pixels.length < stride * height) return false;

  const out = bitmap.data;
  for (let i = 0; i < width * height; i++) {
    const source = i * 4;
    const target = i * 4;
    out[target] = pixels[source + 1];
    out[target + 1] = pixels[source + 2];
    out[target + 2] = pixels[source + 3];
    out[target + 3] = hasAlpha ? pixels[source] : 0xff;
  }
  return true;
}

const FORMAT_15_BIT = 4;
const FORMAT_COLOR_MAPPED = 3;
const LOSSLESS_HEADER_BYTES = 5;
const MAX_PIXELS = 64_000_000;
