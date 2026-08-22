import type { TextureContainer } from '@flighthq/types/contract';
import type { TextureContainerFormat } from '@flighthq/types/contract';
import type { TextureContainerLevel } from '@flighthq/types/contract';
import type { TextureContainerParseFailureReason } from '@flighthq/types/contract';

import {
  createByteReader,
  hasByteReaderBytes,
  readByteReaderU16,
  readByteReaderU24,
  readByteReaderU32,
  readByteReaderU8,
} from './byteReader';

export function getBasisParseFailureReason(bytes: Readonly<Uint8Array>): TextureContainerParseFailureReason | null {
  const failure: ParseFailure = { reason: null };
  const container = parseBasisInternal(bytes, failure);
  return container === null ? failure.reason : null;
}

// Parses a Basis Universal `.basis` container into a `TextureContainer`, or returns `null` if the bytes
// are not a `.basis` file, are truncated, or carry an unknown texture format.
//
// Reads the `basis_file_header` (`m_total_slices`, `m_total_images`, `m_tex_format` — ETC1S or UASTC —
// and `m_slice_desc_file_ofs`) and each `basis_slice_desc` (`m_level_index`, `m_orig_width/height`,
// `m_file_ofs`, `m_file_size`). Every slice becomes one `TextureContainerLevel` in slice-table order;
// `mipLevels` is the max `level_index` + 1 and `layers` is `m_total_images`. The payload is left
// compressed — transcoding ETC1S/UASTC to a GPU format is the caller's / `flight-rs`'s job.
//
// The ETC1S codebook/selector/table sections and per-slice CRCs are not read (they are inputs to the
// transcoder, not to locating a slice). 2D/array images become layers, cubemap-array images become six
// faces per layer, and volume images become depth slices. Video frames are rejected because the common
// container descriptor cannot preserve their temporal/conditional-replenishment semantics truthfully.
export function parseBasis(bytes: Readonly<Uint8Array>): TextureContainer | null {
  return parseBasisInternal(bytes);
}

function parseBasisInternal(bytes: Readonly<Uint8Array>, failure?: ParseFailure): TextureContainer | null {
  if (!hasBasisSignature(bytes)) return reject(failure, 'container-unrecognized');
  if (bytes.byteLength < basisHeaderMinSize) return reject(failure, 'header-truncated');

  const header = createByteReader(bytes, basisTotalSlicesOffset);
  const totalSlices = readByteReaderU24(header); // m_total_slices (offset 14)
  const totalImages = readByteReaderU24(header); // m_total_images (offset 17)
  const format = basisTexFormat[bytes[basisTexFormatOffset]]; // m_tex_format (offset 20)
  if (format === undefined) return reject(failure, 'format-unsupported');
  if (totalSlices === 0) return reject(failure, 'structure-invalid');
  const shape = getBasisTextureShape(bytes[basisTexTypeOffset], totalImages);
  if (shape === null) return reject(failure, 'format-unsupported');

  const sliceDescReader = createByteReader(bytes, basisSliceDescOffsetField);
  const sliceDescOffset = readByteReaderU32(sliceDescReader);

  const table = createByteReader(bytes, sliceDescOffset);
  if (!hasByteReaderBytes(table, totalSlices * basisSliceDescSize)) {
    return reject(failure, 'level-range-out-of-bounds');
  }

  const levels: TextureContainerLevel[] = [];
  let baseWidth = 0;
  let baseHeight = 0;
  let maxLevel = 0;
  for (let slice = 0; slice < totalSlices; slice += 1) {
    const imageIndex = readByteReaderU24(table);
    const levelIndex = readByteReaderU8(table);
    readByteReaderU8(table); // m_flags
    const width = readByteReaderU16(table);
    const height = readByteReaderU16(table);
    readByteReaderU16(table); // m_num_blocks_x
    readByteReaderU16(table); // m_num_blocks_y
    const byteOffset = readByteReaderU32(table);
    const byteLength = readByteReaderU32(table);
    readByteReaderU16(table); // m_slice_data_crc16
    if (byteOffset + byteLength > bytes.byteLength) return reject(failure, 'level-range-out-of-bounds');

    if (imageIndex === 0 && levelIndex === 0) {
      baseWidth = width;
      baseHeight = height;
    }
    if (levelIndex + 1 > maxLevel) maxLevel = levelIndex + 1;
    levels.push({ byteLength, byteOffset, height, width });
  }

  return {
    depth: shape.depth,
    faces: shape.faces,
    format,
    height: baseHeight || (levels[0]?.height ?? 0),
    layers: shape.layers,
    levels,
    mipLevels: Math.max(1, maxLevel),
    supercompression: 'None',
    width: baseWidth || (levels[0]?.width ?? 0),
  };
}

interface ParseFailure {
  reason: TextureContainerParseFailureReason | null;
}

function reject(failure: ParseFailure | undefined, reason: TextureContainerParseFailureReason): null {
  if (failure !== undefined) failure.reason = reason;
  return null;
}

function getBasisTextureShape(
  textureType: number,
  totalImages: number,
): { readonly depth: number; readonly faces: number; readonly layers: number } | null {
  const images = Math.max(1, totalImages);
  switch (textureType) {
    case basisTextureType2d:
    case basisTextureType2dArray:
      return { depth: 1, faces: 1, layers: images };
    case basisTextureTypeCubemapArray:
      if (totalImages === 0 || totalImages % 6 !== 0) return null;
      return { depth: 1, faces: 6, layers: totalImages / 6 };
    case basisTextureTypeVideoFrames:
      return null;
    case basisTextureTypeVolume:
      return { depth: images, faces: 1, layers: 1 };
    default:
      return null;
  }
}

function hasBasisSignature(bytes: Readonly<Uint8Array>): boolean {
  // m_sig = 0x4273, stored little-endian: byte 0 = 0x73 ('s'), byte 1 = 0x42 ('B').
  return bytes.byteLength >= 2 && bytes[0] === 0x73 && bytes[1] === 0x42;
}

const basisTotalSlicesOffset = 14;
const basisTexFormatOffset = 20;
const basisTexTypeOffset = 23;
// Both codebook byte lengths are packed U24 fields. Accounting for those six bytes places
// m_tables_file_size at 61..64 and m_slice_desc_file_ofs immediately after it, at 65..68.
const basisSliceDescOffsetField = 65;
const basisHeaderMinSize = 69; // through m_slice_desc_file_ofs (offset 65, 4 bytes)
const basisSliceDescSize = 23;

const basisTextureType2d = 0;
const basisTextureType2dArray = 1;
const basisTextureTypeCubemapArray = 2;
const basisTextureTypeVideoFrames = 3;
const basisTextureTypeVolume = 4;

const basisTexFormat: Readonly<Record<number, TextureContainerFormat>> = {
  0: 'etc1s',
  1: 'uastc',
};
