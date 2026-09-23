import type { HostDecompressDeflateCapability, HostDecompressLzmaCapability } from '@flighthq/types/contract';

import { uncompressSwfSource } from './swfDocument';
import { parseSwfHeader } from './swfHeader';
import { readSwfHeaderRectangle, readSwfHeaderUint32, SWF_HEADER_PREFIX_LENGTH } from './swfHeaderReader';
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

const SWF_TAG_LONG_FORM_LENGTH = 0x3f;
