import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  SwfHeader,
  SwfTagRectangle,
} from '@flighthq/types/contract';

import { uncompressSwfSource } from './swfDocument';
import { SWF_TAG_NAMES } from './swfTagVocabulary';

/**
 * Walks the tag stream and counts how many times each tag code appears, without interpreting any tag
 * body. Lives here because the tag-record framing — the code/length word and its long-form escape — is
 * SWF's own structure, and this package is where that structure is known. Returns `null` on a file that
 * is not readable to the end of its tag stream.
 *
 * Contract lane only: this is build-time analysis input, not something a running app asks for.
 */
export function collectSwfTagCounts(
  source: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
): ReadonlyMap<number, number> | null {
  const header = parseSwfHeader(source, deflate, lzma);
  if (header === null) return null;
  const uncompressed = uncompressSwfSource(source, deflate, lzma);
  if (uncompressed === null) return null;
  const data = uncompressed.subarray(0, header.fileLength);
  const stageBounds = readSwfHeaderRectangle(data, SWF_HEADER_PREFIX_LENGTH);
  if (stageBounds === null) return null;
  // Past the rectangle sit the 8.8 frame rate and the frame count, two 16-bit fields, and the tag
  // stream begins immediately after them.
  let pos = stageBounds.nextPos + 4;

  const counts = new Map<number, number>();
  while (pos < data.length) {
    if (pos + 2 > data.length) return null;
    const tagHeader = data[pos] + data[pos + 1] * 0x100;
    pos += 2;
    const code = tagHeader >> 6;
    const shortLength = tagHeader & 0x3f;
    let length: number;
    if (shortLength === SWF_TAG_LONG_FORM_LENGTH) {
      if (pos + 4 > data.length) return null;
      length = readSwfHeaderUint32(data, pos);
      pos += 4;
    } else {
      length = shortLength;
    }
    if (length > data.length - pos) return null;
    pos += length;
    // Code 0 is End, which terminates the stream and is not itself content.
    if (code === 0) break;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

/** The tag name SWF gives a code, or a stable `Unknown(n)` label for a code this build does not name. */
export function getSwfTagName(code: number): string {
  return SWF_TAG_NAMES.get(code) ?? `Unknown(${code})`;
}

/**
 * Reads the fixed header of a SWF file: container decompression, then the 8-byte prefix, stage
 * rectangle and frame rate. Stops there — it never enters the tag stream, so its cost is bounded by the
 * header rather than by file size. Returns `null` when the source is not a readable SWF, which is an
 * expected outcome for arbitrary input rather than a programmer error.
 */
export function parseSwfHeader(
  source: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
): SwfHeader | null {
  const uncompressed = uncompressSwfSource(source, deflate, lzma);
  if (uncompressed === null) return null;
  if (uncompressed.length < SWF_HEADER_MIN_LENGTH) return null;
  const version = uncompressed[3];
  const fileLength = readSwfHeaderUint32(uncompressed, 4);
  if (version === 0 || fileLength < SWF_HEADER_MIN_LENGTH || fileLength > uncompressed.length) return null;
  const data = uncompressed.subarray(0, fileLength);
  const stageBounds = readSwfHeaderRectangle(data, SWF_HEADER_PREFIX_LENGTH);
  if (stageBounds === null) return null;
  if (stageBounds.nextPos + 4 > data.length) return null;
  const frameRateRaw = data[stageBounds.nextPos] + data[stageBounds.nextPos + 1] * 0x100;
  return {
    fileLength,
    frameRate: frameRateRaw / SWF_FIXED_8_8_ONE,
    stageBounds: stageBounds.rect,
    version,
  };
}

const SWF_HEADER_PREFIX_LENGTH = 8;
const SWF_HEADER_MIN_LENGTH = 12;
const SWF_FIXED_8_8_ONE = 0x100;
const SWF_TAG_LONG_FORM_LENGTH = 0x3f;
const SWF_TWIPS_PER_PIXEL = 20;

interface SwfHeaderRectangleResult {
  nextPos: number;
  rect: SwfTagRectangle;
}

function readSwfHeaderUint32(data: Uint8Array, offset: number): number {
  return data[offset] + data[offset + 1] * 0x100 + data[offset + 2] * 0x10000 + data[offset + 3] * 0x1000000;
}

function readSwfHeaderRectangle(data: Uint8Array, offset: number): SwfHeaderRectangleResult | null {
  if (offset >= data.length) return null;
  const nbits = data[offset] >> 3;
  const totalBits = 5 + nbits * 4;
  const totalBytes = Math.ceil(totalBits / 8);
  if (offset + totalBytes > data.length) return null;
  let bitPos = offset * 8 + 5;
  const readBits = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byteIndex = bitPos >> 3;
      const bitIndex = 7 - (bitPos & 7);
      value = (value << 1) | ((data[byteIndex] >> bitIndex) & 1);
      bitPos++;
    }
    if (count > 0 && (value & (1 << (count - 1))) !== 0) {
      value |= -1 << count;
    }
    return value;
  };
  const xMin = readBits(nbits);
  const xMax = readBits(nbits);
  const yMin = readBits(nbits);
  const yMax = readBits(nbits);
  return {
    nextPos: offset + totalBytes,
    rect: {
      height: Math.max(0, yMax - yMin) / SWF_TWIPS_PER_PIXEL,
      width: Math.max(0, xMax - xMin) / SWF_TWIPS_PER_PIXEL,
      x: xMin / SWF_TWIPS_PER_PIXEL,
      y: yMin / SWF_TWIPS_PER_PIXEL,
    },
  };
}
