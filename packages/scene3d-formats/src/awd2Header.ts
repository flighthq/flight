import type {
  Awd2Header,
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
} from '@flighthq/types/contract';

import {
  AWD2_FORMAT_VERSION,
  AWD2_HEADER_BYTES,
  AWD2_MAGIC_0,
  AWD2_MAGIC_1,
  AWD2_MAGIC_2,
  AWD2_VERSION_MAJOR_OFFSET,
} from './awd2Schema.ts';

/**
 * Reads the fixed 12-byte AWD2 header: magic, version, flags, compression method and body length. It
 * never enters the block stream, so its cost is bounded by the header rather than by file size.
 *
 * The decompression capabilities are accepted for symmetry with `parseAwd2Requirements` and with the
 * SWF pair, and are deliberately unused: unlike SWF, AWD2 compresses only the body, so the header is
 * always readable as plain bytes. Taking them keeps one call shape across both formats.
 *
 * Returns `null` for anything that is not a readable AWD2 file, which is an expected outcome for
 * arbitrary input rather than a programmer error.
 */
export function parseAwd2Header(
  source: Uint8Array,
  _deflate: Readonly<HostDecompressDeflateCapability> | null,
  _lzma: Readonly<HostDecompressLzmaCapability> | null,
): Awd2Header | null {
  if (source.byteLength < AWD2_HEADER_BYTES) return null;
  if (source[0] !== AWD2_MAGIC_0 || source[1] !== AWD2_MAGIC_1 || source[2] !== AWD2_MAGIC_2) return null;
  const versionMajor = source[AWD2_VERSION_MAJOR_OFFSET];
  if (versionMajor !== AWD2_FORMAT_VERSION) return null;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  return {
    bodyLength: view.getUint32(8, true),
    compression: source[7],
    flags: view.getUint16(5, true),
    versionMajor,
    versionMinor: source[4],
  };
}
