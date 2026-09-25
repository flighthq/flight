import type { HostDecompressDeflateCapability, HostDecompressLzmaCapability } from '@flighthq/types/contract';

import { uncompressSwfSource } from './swfDocument';
import { parseSwfHeader } from './swfHeader';
import { readSwfHeaderRectangle, readSwfHeaderUint32, SWF_HEADER_PREFIX_LENGTH } from './swfHeaderReader';

/**
 * Content-level capability signals extracted from a SWF's tag stream.
 *
 * This is a deeper census than `collectSwfTagCounts`: instead of only counting tag codes, it peeks into
 * specific tag bodies to discover what backend capabilities the content actually exercises. The cost is
 * marginal — the tag stream is already decompressed and in memory, and each signal reads one or two bytes
 * at a fixed offset inside the tag body.
 *
 * These signals drive the requirement analyzer: a SWF that never sets a blend mode does not pull in blend
 * mode application, and a SWF with only solid-color shapes does not pull in texture fill rendering.
 *
 * Contract lane only: build-time analysis input, not something a running app calls.
 */
export interface SwfContentCapabilities {
  readonly tagCounts: ReadonlyMap<number, number>;
  readonly usesBlendMode: boolean;
  readonly usesFilters: boolean;
  readonly usesBitmapFills: boolean;
}

/**
 * Walk the tag stream, count tag codes, and extract content capability signals.
 *
 * Extends the tag-header walk with fixed-offset reads into specific tag bodies:
 *
 * - PlaceObject3 (70) / PlaceObject4 (94): the extended-flags byte is body[1]. Bit 0x01 declares a
 *   filter list; bit 0x02 declares a blend mode. Reading two bytes, both at known positions.
 *
 * - Bitmap character tags (DefineBits, DefineBitsJPEG2/3/4, DefineBitsLossless/1/2): their presence
 *   means the document defines bitmap textures, which shape fills may reference. This is tag-level
 *   (no body peek needed) but recorded as a capability because it implies `beginTextureFill`.
 *
 * Returns `null` when the source is not a readable SWF.
 */
export function collectSwfContentCapabilities(
  source: Uint8Array,
  deflate: Readonly<HostDecompressDeflateCapability> | null,
  lzma: Readonly<HostDecompressLzmaCapability> | null,
): SwfContentCapabilities | null {
  const header = parseSwfHeader(source, deflate, lzma);
  if (header === null) return null;
  const uncompressed = uncompressSwfSource(source, deflate, lzma);
  if (uncompressed === null) return null;
  const data = uncompressed.subarray(0, header.fileLength);
  const stageBounds = readSwfHeaderRectangle(data, SWF_HEADER_PREFIX_LENGTH);
  if (stageBounds === null) return null;
  let pos = stageBounds.nextPos + 4;

  const counts = new Map<number, number>();
  let usesBlendMode = false;
  let usesFilters = false;
  let usesBitmapFills = false;

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

    const bodyStart = pos;
    pos += length;

    if (code === 0) break;
    counts.set(code, (counts.get(code) ?? 0) + 1);

    if ((code === TAG_PLACE_OBJECT_3 || code === TAG_PLACE_OBJECT_4) && length >= 2) {
      const extendedFlags = data[bodyStart + 1];
      if ((extendedFlags & 0x02) !== 0) usesBlendMode = true;
      if ((extendedFlags & 0x01) !== 0) usesFilters = true;
    }

    if (SWF_BITMAP_TAGS.has(code)) usesBitmapFills = true;
  }
  return { tagCounts: counts, usesBlendMode, usesBitmapFills, usesFilters };
}

const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const SWF_TAG_LONG_FORM_LENGTH = 0x3f;

const SWF_BITMAP_TAGS: ReadonlySet<number> = new Set([
  6, // DefineBits
  8, // JPEGTables
  20, // DefineBitsLossless
  21, // DefineBitsJPEG2
  35, // DefineBitsJPEG3
  36, // DefineBitsLossless2
  90, // DefineBitsJPEG4
]);
