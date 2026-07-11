import type { TextureContainer } from '@flighthq/types';
import type { TextureContainerFormat } from '@flighthq/types';
import type { TextureContainerLevel } from '@flighthq/types';

import {
  createByteReader,
  hasByteReaderBytes,
  readByteReaderU24BigEndian,
  readByteReaderU32BigEndian,
} from './byteReader';

// Parses an ATF (Adobe Texture Format) container into an ARRAY of peer `TextureContainer`s, or returns
// `null` if the bytes are not ATF, are truncated, or carry an unsupported ATF format code. ATF is the
// Flash/Stage3D/AIR GPU-texture container (an OpenFL/Lime feature target). Unlike KTX2/DDS/Basis, a
// single ATF embeds the SAME texture in several GPU encodings (DXT + ETC + PVRTC, and — from version 3 —
// ETC2) so a Stage3D runtime picks the one its GPU supports at upload time. Flight expresses that
// multiplicity as the return cardinality — a single-format ATF yields a 1-element array; a
// cross-platform ATF yields N peer containers (no "primary"; use `selectTextureContainer` to pick one by
// GPU support). Each element is a standard single-format `TextureContainer`; the descriptor shape is
// unchanged from the other parsers.
//
// Container parse only: it locates each embedded encoding's format and per-level byte ranges. It never
// decodes pixels. The block byte ranges are reported "as stored"; for a cube map the six sides of one
// encoding become that encoding's container's `faces`.
//
// Header and block framing follow OpenFL's `ATFReader` (the ground-truth reader). The signature is
// `'ATF'`. A versioned file follows the signature marker byte `0xFF` at offset 6 with a version byte and
// a 32-bit big-endian payload length, putting the format header at offset 12; a legacy file (version 0)
// has no marker and carries a 24-bit big-endian length, putting the format header at offset 6. The
// format header is a type/format byte (bit 7 = cube-map flag, low 7 bits = ATF format code), then
// `log2(width)`, `log2(height)`, and the mip count. Blocks then follow as `side → mip level → GPU
// format`, each a big-endian length prefix (24-bit in a legacy file, 32-bit otherwise) followed by that
// many bytes; a zero length marks an absent block. The GPU-format slot order is fixed —
// 0 = DXT (`bc1`/`bc3`), 1 = ETC1, 2 = PVRTC 4bpp, and (version ≥ 3 only) 3 = ETC2 — so this parser
// walks every slot for every (side, level) and groups the non-empty blocks by slot into one peer
// `TextureContainer` each. Only the raw-compressed format codes are supported (2/3/12 opaque,
// 4/5/13 with alpha); the raw-BGRA codes (0/1) and the JPEG-XR/LZMA-wrapped variants are unsupported and
// return `null`.
export function parseAtf(bytes: Readonly<Uint8Array>): TextureContainer[] | null {
  if (!hasAtfSignature(bytes)) return null;

  const versioned = bytes[6] === atfNewVersionMarker;
  const headerOffset = versioned ? atfNewHeaderOffset : atfLegacyHeaderOffset;
  if (bytes.byteLength < headerOffset + 4) return null;

  // `version` selects the block-length width (u24 for the legacy version-0 layout, u32 otherwise) and
  // whether an ETC2 slot follows the DXT/ETC1/PVRTC trio.
  const version = versioned ? bytes[7] : 0;

  // The declared payload runs from the format header to the end; reject a file that claims more than it
  // carries before walking any block.
  const lengthReader = createByteReader(bytes, versioned ? 8 : 3);
  const payloadLength = versioned ? readByteReaderU32BigEndian(lengthReader) : readByteReaderU24BigEndian(lengthReader);
  if (headerOffset + payloadLength > bytes.byteLength) return null;

  const typeFormatByte = bytes[headerOffset];
  const log2Width = bytes[headerOffset + 1];
  const log2Height = bytes[headerOffset + 2];
  const mipCount = bytes[headerOffset + 3];

  const formatCode = typeFormatByte & atfFormatCodeMask;
  const alpha = atfAlphaFormatCodes.has(formatCode);
  if (!alpha && !atfOpaqueFormatCodes.has(formatCode)) return null; // raw-BGRA / JPEG-XR / LZMA — unsupported
  if (log2Width > atfMaxLog2Dimension || log2Height > atfMaxLog2Dimension) return null;
  if (mipCount < 1) return null;

  const cube = (typeFormatByte & atfCubeFlag) !== 0;
  const faces = cube ? 6 : 1;
  const width = 1 << log2Width;
  const height = 1 << log2Height;

  // Slot order is fixed by the format: DXT, ETC1, PVRTC, then ETC2 only from version 3 onward.
  const slotFormats = alpha ? atfAlphaSlotFormats : atfOpaqueSlotFormats;
  const slotCount = version < atfEtc2Version ? atfBaseSlotCount : atfBaseSlotCount + 1;

  // One located-level list per GPU-format slot, filled in the file's `side → level` walk order (so each
  // list is face-major, then mip). A slot with no non-empty block is not a real peer and is dropped.
  const perSlotLevels: TextureContainerLevel[][] = [];
  for (let slot = 0; slot < slotCount; slot += 1) perSlotLevels.push([]);

  const reader = createByteReader(bytes, headerOffset + 4);
  const lengthWidth = version === 0 ? 3 : 4;
  for (let side = 0; side < faces; side += 1) {
    for (let level = 0; level < mipCount; level += 1) {
      for (let slot = 0; slot < slotCount; slot += 1) {
        if (!hasByteReaderBytes(reader, lengthWidth)) return null;
        const blockLength = version === 0 ? readByteReaderU24BigEndian(reader) : readByteReaderU32BigEndian(reader);
        if (!hasByteReaderBytes(reader, blockLength)) return null;
        if (blockLength === 0) continue; // absent encoding for this (side, level)
        const byteOffset = reader.offset;
        reader.offset += blockLength;
        perSlotLevels[slot].push({
          byteLength: blockLength,
          byteOffset,
          height: Math.max(1, height >> level),
          width: Math.max(1, width >> level),
        });
      }
    }
  }

  const containers: TextureContainer[] = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    const levels = perSlotLevels[slot];
    if (levels.length === 0) continue;
    containers.push({
      depth: 1,
      faces,
      format: slotFormats[slot],
      height,
      layers: 1,
      levels,
      // The populated mip count, NOT the header's declared `mipCount`. png2atf "empty mipmaps"
      // files declare the full chain (e.g. 9 for 256x256) but store only the base level; the empty
      // levels are length-0 and skipped, so `levels` holds `faces * populatedMips` entries. Reporting
      // the declared count would leave mipLevels inconsistent with levels.length.
      mipLevels: levels.length / faces,
      supercompression: 'None',
      width,
    });
  }
  if (containers.length === 0) return null;
  return containers;
}

function hasAtfSignature(bytes: Readonly<Uint8Array>): boolean {
  // 'ATF' — 0x41 0x54 0x46. Seven bytes is the shortest header that can carry the version marker at 6.
  return bytes.byteLength >= 7 && bytes[0] === 0x41 && bytes[1] === 0x54 && bytes[2] === 0x46;
}

const atfCubeFlag = 0x80;
const atfFormatCodeMask = 0x7f;
const atfLegacyHeaderOffset = 6;
const atfNewHeaderOffset = 12;
const atfNewVersionMarker = 0xff;
// 2^13 = 8192 is beyond any Stage3D texture; a larger shift signals a corrupt log2 dimension byte.
const atfMaxLog2Dimension = 13;
// Version 3 introduced the fourth (ETC2) GPU-format slot after the DXT/ETC1/PVRTC trio.
const atfEtc2Version = 3;
const atfBaseSlotCount = 3;

// The supported ATF format codes. Opaque codes carry a DXT1 (`bc1`) slot; alpha codes carry DXT5
// (`bc3`). The raw-BGRA codes 0/1 and the JPEG-XR/LZMA-wrapped variants are not supported.
const atfOpaqueFormatCodes: ReadonlySet<number> = new Set([2, 3, 12]);
const atfAlphaFormatCodes: ReadonlySet<number> = new Set([4, 5, 13]);

// GPU-format slot order (index = slot): DXT, ETC1, PVRTC 4bpp, ETC2. Sliced to `slotCount` so a
// version-0/1/2 file exposes only the first three.
const atfOpaqueSlotFormats: readonly TextureContainerFormat[] = ['bc1', 'etc1', 'pvrtc4bppRgb', 'etc2Rgb'];
const atfAlphaSlotFormats: readonly TextureContainerFormat[] = ['bc3', 'etc1', 'pvrtc4bppRgba', 'etc2Rgba'];
