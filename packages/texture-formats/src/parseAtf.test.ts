import type { TextureContainer } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { parseAtf } from './parseAtf';
import { selectTextureContainer } from './selectTextureContainer';

interface AtfOptions {
  version: number;
  formatCode: number;
  cube?: boolean;
  log2Width: number;
  log2Height: number;
  mipCount: number;
  // Block byte-lengths in the file's stored order: side-major, then mip level, then GPU-format slot
  // (0 = DXT, 1 = ETC1, 2 = PVRTC, 3 = ETC2). A zero length marks an absent encoding — the length prefix
  // is still written. The caller supplies exactly `sides * mipCount * slotCount` entries.
  blockLengths: readonly number[];
}

// Builds a minimal ATF byte buffer to the OpenFL `ATFReader` framing and reports the absolute data
// byteOffset of each block, so a test asserts the parser reproduces the builder's own bookkeeping rather
// than a hand-computed number. A versioned file (version != 0) uses the 12-byte header + 32-bit block
// lengths; version 0 uses the 6-byte header + 24-bit block lengths.
function buildAtf(opts: AtfOptions): { bytes: Uint8Array; blockOffsets: number[] } {
  const { version, formatCode, cube = false, log2Width, log2Height, mipCount, blockLengths } = opts;
  const versioned = version !== 0;
  const headerOffset = versioned ? 12 : 6;
  const lengthWidth = versioned ? 4 : 3;
  const bodySize = blockLengths.reduce((sum, length) => sum + lengthWidth + length, 0);
  const bytes = new Uint8Array(headerOffset + 4 + bodySize);

  bytes[0] = 0x41; // 'A'
  bytes[1] = 0x54; // 'T'
  bytes[2] = 0x46; // 'F'

  // Declared payload = everything from the format header (tdata) to the end of the buffer.
  const payloadLength = bytes.byteLength - headerOffset;
  if (versioned) {
    bytes[6] = 0xff; // version marker
    bytes[7] = version;
    writeUintBigEndian(bytes, 8, payloadLength, 4);
  } else {
    writeUintBigEndian(bytes, 3, payloadLength, 3);
  }

  bytes[headerOffset] = (cube ? 0x80 : 0) | formatCode;
  bytes[headerOffset + 1] = log2Width;
  bytes[headerOffset + 2] = log2Height;
  bytes[headerOffset + 3] = mipCount;

  const blockOffsets: number[] = [];
  let offset = headerOffset + 4;
  for (const length of blockLengths) {
    writeUintBigEndian(bytes, offset, length, lengthWidth);
    offset += lengthWidth;
    blockOffsets.push(offset);
    for (let i = 0; i < length; i += 1) bytes[offset + i] = (offset + i) & 0xff;
    offset += length;
  }
  return { blockOffsets, bytes };
}

function writeUintBigEndian(bytes: Uint8Array, offset: number, value: number, width: number): void {
  for (let i = 0; i < width; i += 1) bytes[offset + i] = (value >>> ((width - 1 - i) * 8)) & 0xff;
}

// Asserts every located level range lies inside the buffer and no two ranges overlap (gaps for the
// length prefixes between data blocks are expected).
function expectLevelRangesInBounds(containers: readonly TextureContainer[], byteLength: number): void {
  const ranges: [number, number][] = [];
  for (const container of containers) {
    for (const level of container.levels) ranges.push([level.byteOffset, level.byteOffset + level.byteLength]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let previousEnd = 0;
  for (const [start, end] of ranges) {
    expect(start).toBeGreaterThanOrEqual(previousEnd); // non-overlapping
    expect(end).toBeLessThanOrEqual(byteLength); // in-bounds
    previousEnd = end;
  }
}

describe('parseAtf', () => {
  it('parses a cross-platform ATF as one peer container per populated GPU-format slot', () => {
    // Version 3, format 5 (RAW_COMPRESSED_ALPHA), 8x8, 3 mips, all four slots populated.
    // Slot sizes per level, in side -> level -> slot order:
    //   level0: bc3=64  etc1=32  pvrtc=24  etc2=64
    //   level1: bc3=16  etc1=8   pvrtc=6   etc2=16
    //   level2: bc3=16  etc1=8   pvrtc=6   etc2=16
    const { blockOffsets, bytes } = buildAtf({
      blockLengths: [64, 32, 24, 64, 16, 8, 6, 16, 16, 8, 6, 16],
      formatCode: 5,
      log2Height: 3,
      log2Width: 3,
      mipCount: 3,
      version: 3,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(4);
    expect(containers!.map((c) => c.format)).toEqual(['bc3', 'etc1', 'pvrtc4bppRgba', 'etc2Rgba']);
    for (const container of containers!) {
      expect(container.width).toBe(8);
      expect(container.height).toBe(8);
      expect(container.mipLevels).toBe(3);
      expect(container.faces).toBe(1);
      expect(container.levels).toHaveLength(3);
    }

    // The DXT5 (bc3) slot owns blocks 0, 4, 8; its level0 byteLength is the DXT5 size emitted (64).
    expect(containers![0].levels).toEqual([
      { byteLength: 64, byteOffset: blockOffsets[0], height: 8, width: 8 },
      { byteLength: 16, byteOffset: blockOffsets[4], height: 4, width: 4 },
      { byteLength: 16, byteOffset: blockOffsets[8], height: 2, width: 2 },
    ]);
    expect(containers![0].levels[0].byteLength).toBe(64);
    // ETC2 slot owns blocks 3, 7, 11.
    expect(containers![3].levels).toEqual([
      { byteLength: 64, byteOffset: blockOffsets[3], height: 8, width: 8 },
      { byteLength: 16, byteOffset: blockOffsets[7], height: 4, width: 4 },
      { byteLength: 16, byteOffset: blockOffsets[11], height: 2, width: 2 },
    ]);

    expectLevelRangesInBounds(containers!, bytes.byteLength);
    expect(selectTextureContainer(containers!, ['bc3'])).toBe(containers![0]);
  });

  it('drops all-zero slots, yielding a single-format array', () => {
    // Version 3, format 5, 8x8, 3 mips, but only the DXT5 slot carries data (slots 1-3 length-0).
    const { blockOffsets, bytes } = buildAtf({
      blockLengths: [64, 0, 0, 0, 16, 0, 0, 0, 16, 0, 0, 0],
      formatCode: 5,
      log2Height: 3,
      log2Width: 3,
      mipCount: 3,
      version: 3,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(1);
    expect(containers![0].format).toBe('bc3');
    expect(containers![0].levels).toEqual([
      { byteLength: 64, byteOffset: blockOffsets[0], height: 8, width: 8 },
      { byteLength: 16, byteOffset: blockOffsets[4], height: 4, width: 4 },
      { byteLength: 16, byteOffset: blockOffsets[8], height: 2, width: 2 },
    ]);
  });

  it('reports mipLevels as the POPULATED count, not the declared mipCount (empty-mipmaps files)', () => {
    // png2atf "empty mipmaps": the header declares the full chain (3) but only the base level is
    // stored; mips 1-2 are length-0 across every slot. mipLevels must be 1, matching levels.length —
    // this is the case the real Starling compressed_texture.atf exercises and synthetic slot-drop
    // tests missed.
    const { blockOffsets, bytes } = buildAtf({
      blockLengths: [64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      formatCode: 5,
      log2Height: 3,
      log2Width: 3,
      mipCount: 3,
      version: 3,
    });

    const containers = parseAtf(bytes);
    expect(containers).toHaveLength(1);
    expect(containers![0].format).toBe('bc3');
    expect(containers![0].mipLevels).toBe(1);
    expect(containers![0].levels).toEqual([{ byteLength: 64, byteOffset: blockOffsets[0], height: 8, width: 8 }]);
  });

  it('exposes only three GPU-format slots before version 3 (no ETC2)', () => {
    // Version 2, format 3 (RAW_COMPRESSED, opaque), 4x4, 1 mip, three slots populated. A four-slot walk
    // would read a phantom fourth length prefix and overrun; three containers proves the 3-slot stride.
    const { bytes } = buildAtf({
      blockLengths: [8, 8, 8],
      formatCode: 3,
      log2Height: 2,
      log2Width: 2,
      mipCount: 1,
      version: 2,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(3);
    expect(containers!.map((c) => c.format)).toEqual(['bc1', 'etc1', 'pvrtc4bppRgb']);
  });

  it('reports six faces for a cube ATF, sides as the container levels', () => {
    // Cube flag set, version 3, format 3, 2x2, 1 mip, four slots. 6 sides * 1 level * 4 slots = 24 blocks.
    // Each slot's container carries the six same-slot sides as its levels (side-major for the single mip).
    const { bytes } = buildAtf({
      blockLengths: new Array(24).fill(8),
      cube: true,
      formatCode: 3,
      log2Height: 1,
      log2Width: 1,
      mipCount: 1,
      version: 3,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(4);
    for (const container of containers!) {
      expect(container.faces).toBe(6);
      expect(container.levels).toHaveLength(6); // 6 sides * 1 mip
    }
  });

  it('reads the legacy version-0 header and 24-bit block lengths', () => {
    // Version 0: 6-byte header at offset 6, 24-bit big-endian block-length prefixes, three slots.
    const { blockOffsets, bytes } = buildAtf({
      blockLengths: [16, 0, 0, 16, 0, 0],
      formatCode: 5,
      log2Height: 2,
      log2Width: 2,
      mipCount: 2,
      version: 0,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(1);
    expect(containers![0].format).toBe('bc3');
    expect(containers![0].width).toBe(4);
    expect(containers![0].height).toBe(4);
    expect(containers![0].levels).toEqual([
      { byteLength: 16, byteOffset: blockOffsets[0], height: 4, width: 4 },
      { byteLength: 16, byteOffset: blockOffsets[3], height: 2, width: 2 },
    ]);
  });

  it('returns null for non-ATF or too-short bytes', () => {
    expect(parseAtf(new Uint8Array([0x44, 0x44, 0x53, 0x20, 0, 0, 0]))).toBeNull(); // 'DDS '
    expect(parseAtf(new Uint8Array([0x41, 0x54]))).toBeNull(); // too short for the signature
  });

  it('returns null for unsupported format codes', () => {
    // Code 0 (raw BGRA) and code 1 (raw RGBA) are unsupported; only 2/3/12 and 4/5/13 are.
    const zero = buildAtf({
      blockLengths: [0, 0, 0, 0],
      formatCode: 0,
      log2Height: 2,
      log2Width: 2,
      mipCount: 1,
      version: 3,
    });
    const one = buildAtf({
      blockLengths: [0, 0, 0, 0],
      formatCode: 1,
      log2Height: 2,
      log2Width: 2,
      mipCount: 1,
      version: 3,
    });
    expect(parseAtf(zero.bytes)).toBeNull();
    expect(parseAtf(one.bytes)).toBeNull();
  });

  it('returns null when a block length overruns the buffer', () => {
    // Truncating the tail drops declared payload → null.
    const valid = buildAtf({
      blockLengths: [64, 32, 24, 64, 16, 8, 6, 16, 16, 8, 6, 16],
      formatCode: 5,
      log2Height: 3,
      log2Width: 3,
      mipCount: 3,
      version: 3,
    });
    expect(parseAtf(valid.bytes.subarray(0, valid.bytes.byteLength - 8))).toBeNull();

    // A block-length prefix that claims more than the buffer holds, with the header length left intact,
    // is caught by the per-block bounds check during the walk.
    const patched = buildAtf({
      blockLengths: [64, 0, 0, 0, 16, 0, 0, 0, 16, 0, 0, 0],
      formatCode: 5,
      log2Height: 3,
      log2Width: 3,
      mipCount: 3,
      version: 3,
    });
    // First block's 4-byte prefix sits at offset 16 (12-byte header + 4-byte format block).
    writeUintBigEndian(patched.bytes, 16, 0xffffff, 4);
    expect(parseAtf(patched.bytes)).toBeNull();
  });
});
