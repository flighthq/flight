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
  texType?: number;
  slices: readonly BasisSlice[];
}

const basisHeaderSize = 77;
const basisSliceDescSize = 23;

function setU24(dv: DataView, offset: number, value: number): void {
  dv.setUint8(offset, value & 0xff);
  dv.setUint8(offset + 1, (value >>> 8) & 0xff);
  dv.setUint8(offset + 2, (value >>> 16) & 0xff);
}

function buildBasis(opts: BasisOptions): Uint8Array {
  const { totalImages = 1, texFormat = 0, texType = 0, slices } = opts;
  const sliceTableOffset = basisHeaderSize;
  const dataStart = sliceTableOffset + slices.length * basisSliceDescSize;
  const total = slices.reduce((max, s) => Math.max(max, s.fileOfs + s.fileSize), dataStart);
  const bytes = new Uint8Array(total);
  const dv = new DataView(bytes.buffer);
  bytes[0] = 0x73; // 's'
  bytes[1] = 0x42; // 'B'
  setU24(dv, 14, slices.length); // m_total_slices
  setU24(dv, 17, totalImages); // m_total_images
  bytes[20] = texFormat; // m_tex_format
  bytes[23] = texType; // m_tex_type
  dv.setUint32(63, sliceTableOffset, true); // m_slice_desc_file_ofs
  let off = sliceTableOffset;
  for (const slice of slices) {
    setU24(dv, off, slice.imageIndex);
    bytes[off + 3] = slice.levelIndex;
    dv.setUint16(off + 5, slice.width, true);
    dv.setUint16(off + 7, slice.height, true);
    dv.setUint32(off + 13, slice.fileOfs, true);
    dv.setUint32(off + 17, slice.fileSize, true);
    off += basisSliceDescSize;
  }
  return bytes;
}

describe('parseBasis', () => {
  it('parses a single-slice ETC1S image', () => {
    const container = parseBasis(
      buildBasis({ slices: [{ fileOfs: 100, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }] }),
    );
    expect(container).not.toBeNull();
    expect(container!.format).toBe('etc1s');
    expect(container!.width).toBe(4);
    expect(container!.height).toBe(4);
    expect(container!.mipLevels).toBe(1);
    expect(container!.layers).toBe(1);
    expect(container!.faces).toBe(1);
    expect(container!.supercompression).toBe('None');
    expect(container!.levels).toEqual([{ byteLength: 8, byteOffset: 100, height: 4, width: 4 }]);
  });

  it('reports a mip chain from the slice level indices', () => {
    const container = parseBasis(
      buildBasis({
        slices: [
          { fileOfs: 123, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 },
          { fileOfs: 131, fileSize: 4, height: 2, imageIndex: 0, levelIndex: 1, width: 2 },
        ],
      }),
    );
    expect(container).not.toBeNull();
    expect(container!.mipLevels).toBe(2);
    expect(container!.levels.map((l) => l.width)).toEqual([4, 2]);
    expect(container!.levels.map((l) => l.byteOffset)).toEqual([123, 131]);
  });

  it('maps the UASTC texture format', () => {
    const container = parseBasis(
      buildBasis({
        slices: [{ fileOfs: 100, fileSize: 16, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }],
        texFormat: 1,
      }),
    );
    expect(container!.format).toBe('uastc');
  });

  it('reports each image as an array layer', () => {
    const container = parseBasis(
      buildBasis({
        slices: [
          { fileOfs: 123, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 },
          { fileOfs: 131, fileSize: 8, height: 4, imageIndex: 1, levelIndex: 0, width: 4 },
        ],
        totalImages: 2,
      }),
    );
    expect(container!.layers).toBe(2);
    expect(container!.levels).toHaveLength(2);
  });

  it('reads 24-bit image counts and slice image indices', () => {
    const container = parseBasis(
      buildBasis({
        slices: [{ fileOfs: 100, fileSize: 8, height: 4, imageIndex: 70_000, levelIndex: 0, width: 4 }],
        totalImages: 70_001,
      }),
    );
    expect(container).not.toBeNull();
    expect(container!.layers).toBe(70_001);
    expect(container!.levels).toEqual([{ byteLength: 8, byteOffset: 100, height: 4, width: 4 }]);
  });

  it('preserves cubemap-array faces and layers', () => {
    const slices: BasisSlice[] = [];
    for (let imageIndex = 0; imageIndex < 12; imageIndex++) {
      slices.push({ fileOfs: 353 + imageIndex * 8, fileSize: 8, height: 4, imageIndex, levelIndex: 0, width: 4 });
    }
    const container = parseBasis(buildBasis({ slices, texType: 2, totalImages: 12 }));
    expect(container).not.toBeNull();
    expect(container!.faces).toBe(6);
    expect(container!.layers).toBe(2);
    expect(container!.depth).toBe(1);
    expect(container!.levels).toHaveLength(12);
  });

  it('preserves volume depth and rejects temporal or malformed cube shapes', () => {
    const slices = [
      { fileOfs: 146, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 },
      { fileOfs: 154, fileSize: 8, height: 4, imageIndex: 1, levelIndex: 0, width: 4 },
      { fileOfs: 162, fileSize: 8, height: 4, imageIndex: 2, levelIndex: 0, width: 4 },
    ];
    const volume = parseBasis(buildBasis({ slices, texType: 4, totalImages: 3 }));
    expect(volume).not.toBeNull();
    expect(volume!.depth).toBe(3);
    expect(volume!.faces).toBe(1);
    expect(volume!.layers).toBe(1);

    expect(parseBasis(buildBasis({ slices, texType: 3, totalImages: 3 }))).toBeNull();
    expect(parseBasis(buildBasis({ slices, texType: 2, totalImages: 3 }))).toBeNull();
  });

  it('returns null for a non-Basis, truncated, or unknown-format buffer', () => {
    expect(parseBasis(new Uint8Array([0x44, 0x44, 0x53, 0x20]))).toBeNull();
    expect(parseBasis(new Uint8Array([0x73, 0x42, 0, 0]))).toBeNull();
    expect(
      parseBasis(
        buildBasis({
          slices: [{ fileOfs: 100, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }],
          texFormat: 5,
        }),
      ),
    ).toBeNull();
  });

  it('returns null when the slice table runs past the buffer', () => {
    const bytes = buildBasis({
      slices: [{ fileOfs: 100, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }],
    });
    new DataView(bytes.buffer).setUint32(63, 1_000_000, true); // corrupt m_slice_desc_file_ofs
    expect(parseBasis(bytes)).toBeNull();
  });
});
