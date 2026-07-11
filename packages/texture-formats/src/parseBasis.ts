import type { TextureContainer } from '@flighthq/types';
import type { TextureContainerFormat } from '@flighthq/types';
import type { TextureContainerLevel } from '@flighthq/types';

import {
  createByteReader,
  hasByteReaderBytes,
  readByteReaderU16,
  readByteReaderU32,
  readByteReaderU8,
} from './byteReader';

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
// transcoder, not to locating a slice). Basis cube/video texture types are not distinguished — every
// image is reported as an array layer (`faces` = 1).
export function parseBasis(bytes: Readonly<Uint8Array>): TextureContainer | null {
  if (!hasBasisSignature(bytes)) return null;
  if (bytes.byteLength < basisHeaderMinSize) return null;

  const header = createByteReader(bytes, basisTotalSlicesOffset);
  const totalSlices = readByteReaderU16(header); // m_total_slices (offset 12)
  const totalImages = readByteReaderU16(header); // m_total_images (offset 14)
  const format = basisTexFormat[bytes[basisTexFormatOffset]]; // m_tex_format (offset 16)
  if (format === undefined) return null;
  if (totalSlices === 0) return null;

  const sliceDescReader = createByteReader(bytes, basisSliceDescOffsetField);
  const sliceDescOffset = readByteReaderU32(sliceDescReader);

  const table = createByteReader(bytes, sliceDescOffset);
  if (!hasByteReaderBytes(table, totalSlices * basisSliceDescSize)) return null;

  const levels: TextureContainerLevel[] = [];
  let baseWidth = 0;
  let baseHeight = 0;
  let maxLevel = 0;
  for (let slice = 0; slice < totalSlices; slice += 1) {
    const imageIndex = readByteReaderU16(table);
    const levelIndex = readByteReaderU8(table);
    readByteReaderU8(table); // m_flags
    const width = readByteReaderU16(table);
    const height = readByteReaderU16(table);
    readByteReaderU16(table); // m_num_blocks_x
    readByteReaderU16(table); // m_num_blocks_y
    const byteOffset = readByteReaderU32(table);
    const byteLength = readByteReaderU32(table);
    readByteReaderU16(table); // m_slice_data_crc16
    if (byteOffset + byteLength > bytes.byteLength) return null;

    if (imageIndex === 0 && levelIndex === 0) {
      baseWidth = width;
      baseHeight = height;
    }
    if (levelIndex + 1 > maxLevel) maxLevel = levelIndex + 1;
    levels.push({ byteLength, byteOffset, height, width });
  }

  return {
    depth: 1,
    faces: 1,
    format,
    height: baseHeight || (levels[0]?.height ?? 0),
    layers: Math.max(1, totalImages),
    levels,
    mipLevels: Math.max(1, maxLevel),
    supercompression: 'None',
    width: baseWidth || (levels[0]?.width ?? 0),
  };
}

function hasBasisSignature(bytes: Readonly<Uint8Array>): boolean {
  // m_sig = 0x4273, stored little-endian: byte 0 = 0x73 ('s'), byte 1 = 0x42 ('B').
  return bytes.byteLength >= 2 && bytes[0] === 0x73 && bytes[1] === 0x42;
}

const basisTotalSlicesOffset = 12;
const basisTexFormatOffset = 16;
const basisSliceDescOffsetField = 61;
const basisHeaderMinSize = 65; // through m_slice_desc_file_ofs (offset 61, 4 bytes)
const basisSliceDescSize = 22;

const basisTexFormat: Readonly<Record<number, TextureContainerFormat>> = {
  0: 'etc1s',
  1: 'uastc',
};
