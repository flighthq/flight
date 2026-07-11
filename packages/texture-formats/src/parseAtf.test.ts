import { describe, expect, it } from 'vitest';

import { parseAtf } from './parseAtf';

interface AtfOptions {
  formatCode: number;
  cube?: boolean;
  log2Width: number;
  log2Height: number;
  mipCount: number;
  newVersion?: boolean;
  // Block byte-lengths in the file's stored order: face-major, then mip, then embedded-format index. A
  // zero length marks an absent encoding (the 3-byte prefix is still written).
  blockLengths: readonly number[];
}

// Builds a minimal ATF byte buffer and reports the absolute data byteOffset of each block, so a test
// asserts the parser reproduces the builder's own bookkeeping rather than a hand-computed number.
function buildAtf(opts: AtfOptions): { bytes: Uint8Array; blockOffsets: number[] } {
  const { formatCode, cube = false, log2Width, log2Height, mipCount, newVersion = false, blockLengths } = opts;
  const headerOffset = newVersion ? 12 : 6;
  const bodySize = blockLengths.reduce((sum, length) => sum + 3 + length, 0);
  const bytes = new Uint8Array(headerOffset + 4 + bodySize);

  bytes[0] = 0x41; // 'A'
  bytes[1] = 0x54; // 'T'
  bytes[2] = 0x46; // 'F'
  if (newVersion) bytes[6] = 0xff; // new-version marker
  bytes[headerOffset] = (cube ? 0x80 : 0) | formatCode;
  bytes[headerOffset + 1] = log2Width;
  bytes[headerOffset + 2] = log2Height;
  bytes[headerOffset + 3] = mipCount;

  const blockOffsets: number[] = [];
  let offset = headerOffset + 4;
  for (const length of blockLengths) {
    bytes[offset] = (length >> 16) & 0xff;
    bytes[offset + 1] = (length >> 8) & 0xff;
    bytes[offset + 2] = length & 0xff;
    offset += 3;
    blockOffsets.push(offset);
    for (let i = 0; i < length; i += 1) bytes[offset + i] = (offset + i) & 0xff;
    offset += length;
  }
  return { blockOffsets, bytes };
}

describe('parseAtf', () => {
  it('parses a single-format ATF as a one-element array (DXT5, two mips)', () => {
    // Format 5 embeds [bc3, pvrtc4bppRgba, etc2Rgba]; here only the DXT5 (bc3) slot carries data.
    const { blockOffsets, bytes } = buildAtf({
      blockLengths: [16, 0, 0, 16, 0, 0],
      formatCode: 5,
      log2Height: 2,
      log2Width: 2,
      mipCount: 2,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(1);
    expect(containers![0].format).toBe('bc3');
    expect(containers![0].width).toBe(4);
    expect(containers![0].height).toBe(4);
    expect(containers![0].mipLevels).toBe(2);
    expect(containers![0].faces).toBe(1);
    expect(containers![0].levels).toEqual([
      { byteLength: 16, byteOffset: blockOffsets[0], height: 4, width: 4 },
      { byteLength: 16, byteOffset: blockOffsets[3], height: 2, width: 2 },
    ]);
  });

  it('parses a cross-platform ATF as one peer container per embedded encoding', () => {
    // Format 3 embeds [bc1, pvrtc4bppRgb, etc1]; all three present, interleaved per-mip (2 mips).
    const { blockOffsets, bytes } = buildAtf({
      blockLengths: [8, 8, 8, 8, 8, 8],
      formatCode: 3,
      log2Height: 2,
      log2Width: 2,
      mipCount: 2,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(3);
    expect(containers!.map((c) => c.format)).toEqual(['bc1', 'pvrtc4bppRgb', 'etc1']);
    for (const container of containers!) {
      expect(container.width).toBe(4);
      expect(container.height).toBe(4);
      expect(container.mipLevels).toBe(2);
      expect(container.faces).toBe(1);
    }
    // bc1 owns the mip0/mip1 blocks at indices 0 and 3; etc1 owns indices 2 and 5.
    expect(containers![0].levels).toEqual([
      { byteLength: 8, byteOffset: blockOffsets[0], height: 4, width: 4 },
      { byteLength: 8, byteOffset: blockOffsets[3], height: 2, width: 2 },
    ]);
    expect(containers![2].levels).toEqual([
      { byteLength: 8, byteOffset: blockOffsets[2], height: 4, width: 4 },
      { byteLength: 8, byteOffset: blockOffsets[5], height: 2, width: 2 },
    ]);
  });

  it('reports six faces for a cube ATF', () => {
    // Cube flag set, one mip, three embedded formats → 6 faces * 1 mip * 3 formats = 18 blocks.
    const { bytes } = buildAtf({
      blockLengths: new Array(18).fill(8),
      cube: true,
      formatCode: 3,
      log2Height: 1,
      log2Width: 1,
      mipCount: 1,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(3);
    for (const container of containers!) {
      expect(container.faces).toBe(6);
      expect(container.levels).toHaveLength(6); // 6 faces * 1 mip
    }
  });

  it('reads the newer 12-byte header layout', () => {
    const { blockOffsets, bytes } = buildAtf({
      blockLengths: [16, 0, 0],
      formatCode: 5,
      log2Height: 1,
      log2Width: 1,
      mipCount: 1,
      newVersion: true,
    });

    const containers = parseAtf(bytes);
    expect(containers).not.toBeNull();
    expect(containers).toHaveLength(1);
    expect(containers![0].format).toBe('bc3');
    expect(containers![0].levels[0].byteOffset).toBe(blockOffsets[0]);
  });

  it('returns null for non-ATF, unknown-format, or truncated bytes', () => {
    expect(parseAtf(new Uint8Array([0x44, 0x44, 0x53, 0x20, 0, 0, 0]))).toBeNull(); // 'DDS '
    expect(parseAtf(new Uint8Array([0x41, 0x54]))).toBeNull(); // too short for the signature
    expect(
      parseAtf(buildAtf({ blockLengths: [8], formatCode: 7, log2Height: 2, log2Width: 2, mipCount: 1 }).bytes),
    ).toBeNull(); // format code 7 is unknown
    // A block length that runs past the buffer end.
    const { bytes } = buildAtf({
      blockLengths: [8],
      formatCode: 3,
      log2Height: 2,
      log2Width: 2,
      mipCount: 1,
    });
    const truncated = bytes.subarray(0, bytes.length - 4);
    expect(parseAtf(truncated)).toBeNull();
  });
});
