import type { TextureContainer } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getBasisParseFailureReason, parseBasis } from './parseBasis';

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

interface BasisFixtureExpectation {
  expected: Readonly<TextureContainer>;
  levelIndices: readonly number[];
  path: string;
}

interface UnsupportedBasisFixtureExpectation {
  path: string;
  reason: 'format-unsupported';
  texFormat: number;
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
  dv.setUint32(65, sliceTableOffset, true); // m_slice_desc_file_ofs
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

describe('getBasisParseFailureReason', () => {
  it('reports a truncated detected header', () => {
    expect(getBasisParseFailureReason(new Uint8Array([0x73, 0x42]))).toBe('header-truncated');
  });
});

describe('parseBasis', () => {
  it.each(BASIS_FIXTURE_EXPECTATIONS)('matches the exact measured semantics of $path', (fixture) => {
    expect(parseBasis(buildMeasuredBasisFixture(fixture))).toEqual(fixture.expected);
  });

  it.each(UNSUPPORTED_BASIS_FIXTURE_EXPECTATIONS)(
    'continues to decline unsupported fixture $path as $reason',
    ({ reason, texFormat }) => {
      const bytes = buildBasis({
        slices: [{ fileOfs: 100, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }],
        texFormat,
      });
      expect(parseBasis(bytes)).toBeNull();
      expect(getBasisParseFailureReason(bytes)).toBe(reason);
    },
  );

  it('parses a single-slice ETC1S image', () => {
    const container = parseBasis(
      buildBasis({ slices: [{ fileOfs: 100, fileSize: 8, height: 4, imageIndex: 0, levelIndex: 0, width: 4 }] }),
    );
    expect(container).toEqual({
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 4,
      layers: 1,
      levels: [{ byteLength: 8, byteOffset: 100, height: 4, width: 4 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 4,
    });
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
    new DataView(bytes.buffer).setUint32(65, 1_000_000, true); // corrupt m_slice_desc_file_ofs
    expect(parseBasis(bytes)).toBeNull();
  });
});

function buildMeasuredBasisFixture(fixture: Readonly<BasisFixtureExpectation>): Uint8Array {
  return buildBasis({
    slices: fixture.expected.levels.map((level, index) => ({
      fileOfs: level.byteOffset,
      fileSize: level.byteLength,
      height: level.height,
      imageIndex: 0,
      levelIndex: fixture.levelIndices[index]!,
      width: level.width,
    })),
    texFormat: fixture.expected.format === 'uastc' ? 1 : 0,
  });
}

// Fetch: `npm run fixtures -- texture-container-fixtures`.
// Pinned release 0.1.1 manifest SHA256: 4332d1473b8c47fefd73015d4c7b3ba67edbda3c6faba2c69597f62a47a15744.
const BASIS_FIXTURE_EXPECTATIONS: readonly BasisFixtureExpectation[] = [
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 512,
      layers: 1,
      levels: [
        { byteLength: 62_601, byteOffset: 45_273, height: 512, width: 768 },
        { byteLength: 40_817, byteOffset: 107_874, height: 512, width: 768 },
      ],
      mipLevels: 1,
      supercompression: 'None',
      width: 768,
    },
    levelIndices: [0, 0],
    path: 'basis/webgl/texture_test/assets/alpha3.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 512,
      layers: 1,
      levels: [
        { byteLength: 48_567, byteOffset: 10_417, height: 512, width: 768 },
        { byteLength: 12_500, byteOffset: 58_984, height: 256, width: 384 },
        { byteLength: 3_173, byteOffset: 71_484, height: 128, width: 192 },
        { byteLength: 827, byteOffset: 74_657, height: 64, width: 96 },
        { byteLength: 217, byteOffset: 75_484, height: 32, width: 48 },
        { byteLength: 61, byteOffset: 75_701, height: 16, width: 24 },
        { byteLength: 14, byteOffset: 75_762, height: 8, width: 12 },
        { byteLength: 7, byteOffset: 75_776, height: 4, width: 6 },
        { byteLength: 4, byteOffset: 75_783, height: 2, width: 3 },
        { byteLength: 4, byteOffset: 75_787, height: 1, width: 1 },
      ],
      mipLevels: 10,
      supercompression: 'None',
      width: 768,
    },
    levelIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    path: 'basis/webgl/texture_test/assets/kodim01_mipmapped.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 512,
      layers: 1,
      levels: [{ byteLength: 51_390, byteOffset: 33_914, height: 512, width: 768 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 768,
    },
    levelIndices: [0],
    path: 'basis/webgl/texture_test/assets/kodim03.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'uastc',
      height: 512,
      layers: 1,
      levels: [{ byteLength: 393_216, byteOffset: 100, height: 512, width: 768 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 768,
    },
    levelIndices: [0],
    path: 'basis/webgl/texture_test/assets/kodim03_uastc.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'uastc',
      height: 768,
      layers: 1,
      levels: [{ byteLength: 393_216, byteOffset: 100, height: 768, width: 512 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 512,
    },
    levelIndices: [0],
    path: 'basis/webgl/texture_test/assets/kodim18_uastc.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 512,
      layers: 1,
      levels: [{ byteLength: 39_560, byteOffset: 12_936, height: 512, width: 768 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 768,
    },
    levelIndices: [0],
    path: 'basis/webgl/texture_test/assets/kodim20.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 1_024,
      layers: 1,
      levels: [{ byteLength: 52_083, byteOffset: 38_700, height: 1_024, width: 1_024 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 1_024,
    },
    levelIndices: [0],
    path: 'basis/webgl/texture_test/assets/kodim20_1024x1024.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'uastc',
      height: 1_024,
      layers: 1,
      levels: [{ byteLength: 1_048_576, byteOffset: 100, height: 1_024, width: 1_024 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 1_024,
    },
    levelIndices: [0],
    path: 'basis/webgl/texture_test/assets/kodim26_uastc_1024.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 8,
      layers: 1,
      levels: [
        { byteLength: 1, byteOffset: 223, height: 8, width: 8 },
        { byteLength: 2, byteOffset: 224, height: 8, width: 8 },
      ],
      mipLevels: 1,
      supercompression: 'None',
      width: 8,
    },
    levelIndices: [0, 0],
    path: 'ktx/basis/alpha_simple.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 1_024,
      layers: 1,
      levels: [{ byteLength: 64_199, byteOffset: 7_361, height: 1_024, width: 1_024 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 1_024,
    },
    levelIndices: [0],
    path: 'ktx/basis/color_grid.basis',
  },
  {
    expected: {
      depth: 1,
      faces: 1,
      format: 'etc1s',
      height: 768,
      layers: 1,
      levels: [{ byteLength: 45_303, byteOffset: 10_382, height: 768, width: 512 }],
      mipLevels: 1,
      supercompression: 'None',
      width: 512,
    },
    levelIndices: [0],
    path: 'ktx/basis/kodim17.basis',
  },
];

const UNSUPPORTED_BASIS_FIXTURE_EXPECTATIONS: readonly UnsupportedBasisFixtureExpectation[] = [
  { path: 'basis/webgl/texture_test/assets/base.basis', reason: 'format-unsupported', texFormat: 6 },
  { path: 'basis/webgl/texture_test/assets/desk.basis', reason: 'format-unsupported', texFormat: 2 },
  { path: 'basis/webgl/texture_test/assets/desk_6x6.basis', reason: 'format-unsupported', texFormat: 3 },
  { path: 'basis/webgl/texture_test/assets/desk_6x6i.basis', reason: 'format-unsupported', texFormat: 4 },
  { path: 'basis/webgl/texture_test/assets/kodim23_hdr.basis', reason: 'format-unsupported', texFormat: 2 },
];
