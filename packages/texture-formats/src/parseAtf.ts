import type { TextureContainer } from '@flighthq/types';
import type { TextureContainerFormat } from '@flighthq/types';
import type { TextureContainerLevel } from '@flighthq/types';

import { createByteReader, hasByteReaderBytes, readByteReaderU24BigEndian } from './byteReader';

// Parses an ATF (Adobe Texture Format) container into an ARRAY of peer `TextureContainer`s, or returns
// `null` if the bytes are not ATF, are truncated, or carry an unknown ATF format code. ATF is the
// Flash/Stage3D/AIR GPU-texture container (an OpenFL/Lime feature target). Unlike KTX2/DDS/Basis, a
// single ATF can embed the SAME texture in several GPU encodings (DXT + PVRTC + ETC, sometimes
// ETC2/ASTC) so a Stage3D runtime picks the one its GPU supports at upload time. Flight expresses that
// multiplicity as the return cardinality — a single-format ATF yields a 1-element array; a
// cross-platform ATF yields N peer containers (no "primary"; use `selectTextureContainer` to pick one
// by GPU support). Each element is a standard single-format `TextureContainer`; the descriptor shape is
// unchanged from the other parsers.
//
// Container parse only: it locates each embedded encoding's format and per-level byte ranges. It never
// decodes pixels. For the lossy ATF format codes the located blocks are JPEG-XR-wrapped GPU-texture
// payloads (and the raw RGBA codes may hold a JPEG/JPEG-XR image); those ranges are reported "as stored"
// and require a JPEG-XR/JPEG decode (a `flight-rs` concern) before upload, the same boundary as Basis
// transcoding — see the charter.
//
// Header (reconstructed from the Adobe ATF SDK and Starling's `ATFData` reader; NOT yet validated
// against a real `.atf` file — the highest-risk area, like the Basis parser): bytes 0..2 are `'ATF'`.
// A legacy file follows the signature with a 3-byte big-endian length, then the format block at offset
// 6; a newer file carries a version + 32-bit length and puts the format block at offset 12. They are
// told apart by the marker byte at offset 6: the legacy format byte's low 7 bits are a 0..13 format
// code (never 0xFF), so `bytes[6] === 0xFF` flags the newer layout. The format block is: a format byte
// (bit 7 = cube-map flag, low 7 bits = ATF format code), `log2(width)`, `log2(height)`, and a
// texture/mip count. Each embedded encoding's per-(face,mip) data then follows as a 3-byte big-endian
// length prefix + that many bytes; a zero length marks an absent block. The blocks are interleaved
// per-mip-then-per-format (matching how Stage3D strides the buffer, skipping the formats a GPU lacks),
// so this parser groups the strided blocks by format index into one peer `TextureContainer` each.
export function parseAtf(bytes: Readonly<Uint8Array>): TextureContainer[] | null {
  if (!hasAtfSignature(bytes)) return null;

  const headerOffset = bytes[6] === atfNewVersionMarker ? atfNewHeaderOffset : atfLegacyHeaderOffset;
  if (bytes.byteLength < headerOffset + 4) return null;

  const formatByte = bytes[headerOffset];
  const log2Width = bytes[headerOffset + 1];
  const log2Height = bytes[headerOffset + 2];
  const textureCount = bytes[headerOffset + 3];

  const embedded = atfEmbeddedFormats[formatByte & atfFormatCodeMask];
  if (embedded === undefined) return null;
  if (log2Width > atfMaxLog2Dimension || log2Height > atfMaxLog2Dimension) return null;

  const cube = (formatByte & atfCubeFlag) !== 0;
  const faces = cube ? 6 : 1;
  const width = 1 << log2Width;
  const height = 1 << log2Height;
  const mipLevels = Math.max(1, textureCount);

  // One located-level list per embedded encoding, indexed by the encoding's position in `embedded`.
  const perFormatLevels: TextureContainerLevel[][] = embedded.map(() => []);

  const reader = createByteReader(bytes, headerOffset + 4);
  for (let face = 0; face < faces; face += 1) {
    for (let mip = 0; mip < mipLevels; mip += 1) {
      const mipWidth = Math.max(1, width >> mip);
      const mipHeight = Math.max(1, height >> mip);
      for (let f = 0; f < embedded.length; f += 1) {
        if (!hasByteReaderBytes(reader, 3)) return null;
        const blockLength = readByteReaderU24BigEndian(reader);
        if (blockLength === 0) continue; // absent encoding for this (face, mip)
        const byteOffset = reader.offset;
        if (!hasByteReaderBytes(reader, blockLength)) return null;
        reader.offset += blockLength;
        perFormatLevels[f].push({ byteLength: blockLength, byteOffset, height: mipHeight, width: mipWidth });
      }
    }
  }

  const containers: TextureContainer[] = [];
  for (let f = 0; f < embedded.length; f += 1) {
    const levels = perFormatLevels[f];
    if (levels.length === 0) continue; // an encoding with no stored blocks is not a real peer
    containers.push({
      depth: 1,
      faces,
      format: embedded[f],
      height,
      layers: 1,
      levels,
      mipLevels,
      supercompression: 'None',
      width,
    });
  }
  if (containers.length === 0) return null;
  return containers;
}

function hasAtfSignature(bytes: Readonly<Uint8Array>): boolean {
  // 'ATF' — 0x41 0x54 0x46.
  return bytes.byteLength >= 7 && bytes[0] === 0x41 && bytes[1] === 0x54 && bytes[2] === 0x46;
}

const atfCubeFlag = 0x80;
const atfFormatCodeMask = 0x7f;
const atfLegacyHeaderOffset = 6;
const atfNewHeaderOffset = 12;
const atfNewVersionMarker = 0xff;
// 2^13 = 8192 is beyond any Stage3D texture; a larger shift signals a corrupt log2 dimension byte.
const atfMaxLog2Dimension = 13;

// ATF format code (format byte & 0x7f) → the ordered list of GPU encodings embedded per mip, in the
// order their length-prefixed blocks appear. Codes 0/1 are single raw encodings; the compressed codes
// bundle the cross-platform set. The DXT slot is DXT1 (`bc1`) for the RGB codes and DXT5 (`bc3`) for the
// alpha codes; PVRTC/ETC follow, and codes 12/13 add the newer ETC2/ASTC members.
//
// HONESTY: this code→encoding mapping and the per-mip block ORDER/COUNT are reconstructed from
// spec-memory of the Adobe ATF SDK, not confirmed against real `.atf` files. Codes 0/1 (nominally RGB888
// / RGBA8888) map to `bgra8unorm` because the vocabulary has no 24-bit RGB member and Stage3D uploads
// BGRA; their single block is located, not decoded (it may be a JPEG/JPEG-XR image). Real-file
// validation of both the mapping and the block framing is a follow-up.
const atfEmbeddedFormats: Readonly<Record<number, readonly TextureContainerFormat[]>> = {
  0: ['bgra8unorm'], // RGB888
  1: ['bgra8unorm'], // RGBA8888
  2: ['bc1', 'pvrtc4bppRgb', 'etc1'], // COMPRESSED (JPEG-XR wrapped)
  3: ['bc1', 'pvrtc4bppRgb', 'etc1'], // COMPRESSEDRAW
  4: ['bc3', 'pvrtc4bppRgba', 'etc2Rgba'], // COMPRESSEDALPHA (JPEG-XR wrapped)
  5: ['bc3', 'pvrtc4bppRgba', 'etc2Rgba'], // COMPRESSEDRAWALPHA
  12: ['bc1', 'pvrtc4bppRgb', 'etc1', 'etc2Rgb', 'astc4x4'], // COMPRESSED + ETC2/ASTC
  13: ['bc3', 'pvrtc4bppRgba', 'etc2Rgba', 'astc4x4'], // COMPRESSEDALPHA + ETC2/ASTC
};
