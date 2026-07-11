import { describe, expect, it } from 'vitest';

import { parseBasis } from './parseBasis';

interface BasisSlice {
  imageIndex: number;
  levelIndex: number;
  width: number;
  height: number;
  fileOfs: number;
  fileSize: number;
}

interface BasisOptions {
  totalImages?: number;
  texFormat?: number;
  slices: readonly BasisSlice[];
}

const basisHeaderSize = 77;
const basisSliceDescSize = 22;

function buildBasis(opts: BasisOptions): Uint8Array {
  const { totalImages = 1, texFormat = 0, slices } = opts;
  const sliceTableOffset = basisHeaderSize;
  const dataStart = sliceTableOffset + slices.length * basisSliceDescSize;
  const total = slices.reduce((max, s) => Math.max(max, s.fileOfs + s.fileSize), dataStart);
  const bytes = new Uint8Array(total);
  const dv = new DataView(bytes.buffer);
  bytes[0] = 0x73; // 's'
  bytes[1] = 0x42; // 'B'
  dv.setUint16(12, slices.length, true); // m_total_slices
  dv.setUint16(14, totalImages, true); // m_total_images
  bytes[16] = texFormat; // m_tex_format
  dv.setUint32(61, sliceTableOffset, true); // m_slice_desc_file_ofs
  let off = sliceTableOffset;
  for (const slice of slices) {
    dv.setUint16(off + 0, slice.imageIndex, true);
    bytes[off + 2] = slice.levelIndex;
    dv.setUint16(off + 4, slice.width, true);
    dv.setUint16(off + 6, slice.height, true);
    dv.setUint32(off + 12, slice.fileOfs, true);
    dv.setUint32(off + 16, slice.fileSize, true);
    off += basisSliceDescSize;
  }
  return bytes;
}

describe('parseBasis', () => {
  it('parses a single-slice ETC1S image', () => {
    const container = parseBasis(
      buildBasis({ slices: [{ fileOfs: 99, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }] }),
    );
    expect(container).not.toBeNull();
    expect(container!.format).toBe('etc1s');
    expect(container!.width).toBe(4);
    expect(container!.height).toBe(4);
    expect(container!.mipLevels).toBe(1);
    expect(container!.layers).toBe(1);
    expect(container!.faces).toBe(1);
    expect(container!.supercompression).toBe('None');
    expect(container!.levels).toEqual([{ byteLength: 8, byteOffset: 99, height: 4, width: 4 }]);
  });

  it('reports a mip chain from the slice level indices', () => {
    const container = parseBasis(
      buildBasis({
        slices: [
          { fileOfs: 121, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 },
          { fileOfs: 129, fileSize: 4, height: 2, imageIndex: 0, levelIndex: 1, width: 2 },
        ],
      }),
    );
    expect(container).not.toBeNull();
    expect(container!.mipLevels).toBe(2);
    expect(container!.levels.map((l) => l.width)).toEqual([4, 2]);
    expect(container!.levels.map((l) => l.byteOffset)).toEqual([121, 129]);
  });

  it('maps the UASTC texture format', () => {
    const container = parseBasis(
      buildBasis({
        slices: [{ fileOfs: 99, fileSize: 16, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }],
        texFormat: 1,
      }),
    );
    expect(container!.format).toBe('uastc');
  });

  it('reports each image as an array layer', () => {
    const container = parseBasis(
      buildBasis({
        slices: [
          { fileOfs: 121, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 },
          { fileOfs: 129, fileSize: 8, height: 4, imageIndex: 1, levelIndex: 0, width: 4 },
        ],
        totalImages: 2,
      }),
    );
    expect(container!.layers).toBe(2);
    expect(container!.levels).toHaveLength(2);
  });

  it('returns null for a non-Basis, truncated, or unknown-format buffer', () => {
    expect(parseBasis(new Uint8Array([0x44, 0x44, 0x53, 0x20]))).toBeNull();
    expect(parseBasis(new Uint8Array([0x73, 0x42, 0, 0]))).toBeNull();
    expect(
      parseBasis(
        buildBasis({
          slices: [{ fileOfs: 99, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }],
          texFormat: 5,
        }),
      ),
    ).toBeNull();
  });

  it('returns null when the slice table runs past the buffer', () => {
    const bytes = buildBasis({
      slices: [{ fileOfs: 99, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }],
    });
    new DataView(bytes.buffer).setUint32(61, 1_000_000, true); // corrupt m_slice_desc_file_ofs
    expect(parseBasis(bytes)).toBeNull();
  });
});
