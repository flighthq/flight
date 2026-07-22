import { describe, expect, it } from 'vitest';

import { parseKtx2 } from './parseKtx2';

const ktx2Magic = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

interface Ktx2Level {
  byteOffset: number;
  byteLength: number;
}

interface Ktx2Options {
  vkFormat: number;
  width: number;
  height: number;
  depth?: number;
  layerCount?: number;
  faceCount?: number;
  scheme?: number;
  levels: readonly Ktx2Level[];
}

function buildKtx2(opts: Ktx2Options): Uint8Array {
  const { vkFormat, width, height, depth = 0, layerCount = 0, faceCount = 1, scheme = 0, levels } = opts;
  const dataStart = 80 + levels.length * 24;
  const total = levels.reduce((max, l) => Math.max(max, l.byteOffset + l.byteLength), dataStart);
  const bytes = new Uint8Array(total);
  const dv = new DataView(bytes.buffer);
  bytes.set(ktx2Magic, 0);
  dv.setUint32(12, vkFormat, true);
  dv.setUint32(16, 4, true); // typeSize
  dv.setUint32(20, width, true);
  dv.setUint32(24, height, true);
  dv.setUint32(28, depth, true);
  dv.setUint32(32, layerCount, true);
  dv.setUint32(36, faceCount, true);
  dv.setUint32(40, levels.length, true);
  dv.setUint32(44, scheme, true);
  let off = 80;
  for (const level of levels) {
    dv.setBigUint64(off, BigInt(level.byteOffset), true);
    dv.setBigUint64(off + 8, BigInt(level.byteLength), true);
    dv.setBigUint64(off + 16, BigInt(level.byteLength), true);
    off += 24;
  }
  return bytes;
}

describe('parseKtx2', () => {
  it('parses a single-mip uncompressed 2D texture', () => {
    const container = parseKtx2(
      buildKtx2({ vkFormat: 37, width: 4, height: 4, levels: [{ byteLength: 64, byteOffset: 104 }] }),
    );
    expect(container).not.toBeNull();
    expect(container!.format).toBe('rgba8unorm');
    expect(container!.width).toBe(4);
    expect(container!.height).toBe(4);
    expect(container!.depth).toBe(1);
    expect(container!.mipLevels).toBe(1);
    expect(container!.layers).toBe(1);
    expect(container!.faces).toBe(1);
    expect(container!.supercompression).toBe('None');
    expect(container!.levels).toEqual([{ byteLength: 64, byteOffset: 104, height: 4, width: 4 }]);
  });

  it('splits an uncompressed cubemap level into six per-face sub-images', () => {
    const container = parseKtx2(
      buildKtx2({ vkFormat: 37, width: 4, height: 4, faceCount: 6, levels: [{ byteLength: 384, byteOffset: 104 }] }),
    );
    expect(container).not.toBeNull();
    expect(container!.faces).toBe(6);
    expect(container!.levels).toHaveLength(6);
    expect(container!.levels.map((l) => l.byteLength)).toEqual([64, 64, 64, 64, 64, 64]);
    expect(container!.levels.map((l) => l.byteOffset)).toEqual([104, 168, 232, 296, 360, 424]);
  });

  it('splits an uncompressed array level into one range per layer', () => {
    const container = parseKtx2(
      buildKtx2({
        layerCount: 3,
        levels: [{ byteLength: 192, byteOffset: 104 }],
        vkFormat: 37,
        width: 4,
        height: 4,
      }),
    );
    expect(container).not.toBeNull();
    expect(container!.layers).toBe(3);
    expect(container!.levels).toEqual([
      { byteLength: 64, byteOffset: 104, height: 4, width: 4 },
      { byteLength: 64, byteOffset: 168, height: 4, width: 4 },
      { byteLength: 64, byteOffset: 232, height: 4, width: 4 },
    ]);
  });

  it('reports each mip of a mip chain from the level index', () => {
    const container = parseKtx2(
      buildKtx2({
        vkFormat: 37,
        width: 8,
        height: 8,
        levels: [
          { byteLength: 256, byteOffset: 176 },
          { byteLength: 64, byteOffset: 432 },
          { byteLength: 16, byteOffset: 496 },
          { byteLength: 4, byteOffset: 512 },
        ],
      }),
    );
    expect(container).not.toBeNull();
    expect(container!.mipLevels).toBe(4);
    expect(container!.levels.map((l) => l.width)).toEqual([8, 4, 2, 1]);
    expect(container!.levels.map((l) => l.byteOffset)).toEqual([176, 432, 496, 512]);
  });

  it('reports a BasisLZ-supercompressed level as one compressed blob (etc1s)', () => {
    const container = parseKtx2(
      buildKtx2({ vkFormat: 0, width: 4, height: 4, scheme: 1, levels: [{ byteLength: 48, byteOffset: 104 }] }),
    );
    expect(container).not.toBeNull();
    expect(container!.format).toBe('etc1s');
    expect(container!.supercompression).toBe('BasisLZ');
    expect(container!.levels).toHaveLength(1);
    expect(container!.levels[0].byteLength).toBe(48);
  });

  it('maps an undefined vkFormat with no supercompression to uastc', () => {
    const container = parseKtx2(
      buildKtx2({ vkFormat: 0, width: 4, height: 4, scheme: 0, levels: [{ byteLength: 64, byteOffset: 104 }] }),
    );
    expect(container!.format).toBe('uastc');
  });

  it('preserves Zstd and ZLIB supercompressed levels as indivisible blobs', () => {
    for (const [scheme, supercompression] of [
      [2, 'Zstd'],
      [3, 'ZLIB'],
    ] as const) {
      const container = parseKtx2(
        buildKtx2({
          layerCount: 2,
          levels: [{ byteLength: 48, byteOffset: 104 }],
          scheme,
          vkFormat: 37,
          width: 4,
          height: 4,
        }),
      );
      expect(container).not.toBeNull();
      expect(container!.supercompression).toBe(supercompression);
      expect(container!.levels).toEqual([{ byteLength: 48, byteOffset: 104, height: 4, width: 4 }]);
    }
  });

  it('returns null for a non-KTX2 buffer', () => {
    expect(parseKtx2(new Uint8Array([0x44, 0x44, 0x53, 0x20]))).toBeNull();
  });

  it('returns null for an unmapped vkFormat', () => {
    expect(
      parseKtx2(buildKtx2({ vkFormat: 9999, width: 4, height: 4, levels: [{ byteLength: 64, byteOffset: 104 }] })),
    ).toBeNull();
  });

  it('returns null when a level range runs past the buffer', () => {
    const bytes = buildKtx2({ vkFormat: 37, width: 4, height: 4, levels: [{ byteLength: 64, byteOffset: 104 }] });
    const dv = new DataView(bytes.buffer);
    dv.setBigUint64(80 + 8, BigInt(1_000_000), true); // corrupt the level byteLength
    expect(parseKtx2(bytes)).toBeNull();
  });

  it('returns null for a truncated header', () => {
    expect(parseKtx2(new Uint8Array([...ktx2Magic, 0, 0, 0, 0]))).toBeNull();
  });
});
