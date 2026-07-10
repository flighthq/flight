import { describe, expect, it } from 'vitest';

import { computeTextureContainerLevels, getTextureContainerLevelByteLength } from './textureLevelLayout';

describe('computeTextureContainerLevels', () => {
  it('builds a contiguous mip chain with descending dimensions and offsets', () => {
    const result = computeTextureContainerLevels('bc1', 8, 8, 4, 1, 1, 100);
    expect(result).not.toBeNull();
    const levels = result!.levels;
    expect(levels.map((l) => l.width)).toEqual([8, 4, 2, 1]);
    // bc1 = 8 bytes/block, 4x4 blocks: 8x8 -> 2x2 blocks -> 32; 4x4 -> 8; 2x2/1x1 floor to 1 block -> 8.
    expect(levels.map((l) => l.byteLength)).toEqual([32, 8, 8, 8]);
    expect(levels.map((l) => l.byteOffset)).toEqual([100, 132, 140, 148]);
    expect(result!.endOffset).toBe(156);
  });

  it('nests layer -> face -> mip so each face holds a full mip chain', () => {
    const result = computeTextureContainerLevels('bc3', 4, 4, 1, 1, 6, 0);
    expect(result).not.toBeNull();
    expect(result!.levels).toHaveLength(6);
    // bc3 = 16 bytes/block, one 4x4 block per face.
    expect(result!.levels.map((l) => l.byteOffset)).toEqual([0, 16, 32, 48, 64, 80]);
  });

  it('returns null for a format without a fixed block size', () => {
    expect(computeTextureContainerLevels('etc1s', 4, 4, 1, 1, 1, 0)).toBeNull();
  });
});

describe('getTextureContainerLevelByteLength', () => {
  it('multiplies bytes-per-pixel for uncompressed formats', () => {
    expect(getTextureContainerLevelByteLength('rgba8unorm', 4, 4)).toBe(64);
    expect(getTextureContainerLevelByteLength('r8unorm', 4, 4)).toBe(16);
  });

  it('rounds up to whole blocks for block-compressed formats', () => {
    expect(getTextureContainerLevelByteLength('bc1', 4, 4)).toBe(8);
    expect(getTextureContainerLevelByteLength('bc7', 5, 5)).toBe(64); // 2x2 blocks * 16
    expect(getTextureContainerLevelByteLength('astc6x6', 6, 6)).toBe(16);
  });

  it('returns -1 for a variable-rate format', () => {
    expect(getTextureContainerLevelByteLength('etc1s', 4, 4)).toBe(-1);
  });
});
