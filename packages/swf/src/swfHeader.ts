import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  SwfHeader,
} from '@flighthq/types/contract';

import { uncompressSwfSource } from './swfDocument';
import { readSwfHeaderRectangle, readSwfHeaderUint32, SWF_HEADER_PREFIX_LENGTH } from './swfHeaderReader';

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

const SWF_HEADER_MIN_LENGTH = 12;
const SWF_FIXED_8_8_ONE = 0x100;
