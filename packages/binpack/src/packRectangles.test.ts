import type { PackableRectangle, PackedRectangle } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { packRectangles } from './packRectangles';

describe('packRectangles', () => {
  it('places ~20 varied rectangles with no pairwise overlap, inside the bin, at their input size', () => {
    const rects: PackableRectangle[] = [];
    for (let i = 0; i < 20; i++) {
      rects.push({ id: i, width: 8 + ((i * 7) % 40), height: 6 + ((i * 13) % 34) });
    }

    const result = packRectangles(rects, { padding: 1, border: 2 });
    expect(result.unpacked).toEqual([]);
    expect(result.placements).toHaveLength(20);

    const sizeById = new Map(rects.map((rect) => [rect.id, rect] as const));
    for (const placement of result.placements) {
      const input = sizeById.get(placement.id)!;
      const expectedWidth = placement.rotated ? input.height : input.width;
      const expectedHeight = placement.rotated ? input.width : input.height;
      expect(placement.width).toBe(expectedWidth);
      expect(placement.height).toBe(expectedHeight);

      expect(placement.x).toBeGreaterThanOrEqual(2);
      expect(placement.y).toBeGreaterThanOrEqual(2);
      expect(placement.x + placement.width).toBeLessThanOrEqual(result.width - 2);
      expect(placement.y + placement.height).toBeLessThanOrEqual(result.height - 2);
    }

    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(rectanglesOverlap(result.placements[i], result.placements[j])).toBe(false);
      }
    }
  });

  it('leaves nothing unpacked when everything fits in a growable bin', () => {
    const rects: PackableRectangle[] = [
      { id: 'a', width: 30, height: 20 },
      { id: 'b', width: 40, height: 40 },
      { id: 'c', width: 10, height: 60 },
      { id: 'd', width: 25, height: 25 },
      { id: 'e', width: 50, height: 15 },
    ];

    const result = packRectangles(rects);
    expect(result.unpacked).toEqual([]);
    expect(result.placements).toHaveLength(5);
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(rectanglesOverlap(result.placements[i], result.placements[j])).toBe(false);
      }
    }
  });

  it('reports overflow ids in a fixed bin and keeps the placed rectangles non-overlapping', () => {
    const rects: PackableRectangle[] = [];
    for (let i = 0; i < 12; i++) {
      rects.push({ id: i, width: 20, height: 20 });
    }

    const result = packRectangles(rects, { growable: false, maxWidth: 44, maxHeight: 44 });
    expect(result.unpacked.length).toBeGreaterThan(0);
    expect(result.placements.length + result.unpacked.length).toBe(12);
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(rectanglesOverlap(result.placements[i], result.placements[j])).toBe(false);
      }
    }
  });

  it('respects padding between neighbors and border at the bin edge', () => {
    const rects: PackableRectangle[] = [
      { id: 'a', width: 10, height: 10 },
      { id: 'b', width: 10, height: 10 },
    ];

    const result = packRectangles(rects, { padding: 2, border: 4 });
    expect(result.unpacked).toEqual([]);

    const a = result.placements.find((p) => p.id === 'a')!;
    const b = result.placements.find((p) => p.id === 'b')!;
    expect(a).toEqual({ id: 'a', x: 4, y: 4, width: 10, height: 10, rotated: false });
    expect(b).toEqual({ id: 'b', x: 16, y: 4, width: 10, height: 10, rotated: false });

    // Gap between the two neighbors is exactly the padding.
    expect(b.x - (a.x + a.width)).toBe(2);
    // Every placement is at least `border` from every bin edge.
    for (const placement of result.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(4);
      expect(placement.y).toBeGreaterThanOrEqual(4);
      expect(placement.x + placement.width).toBeLessThanOrEqual(result.width - 4);
      expect(placement.y + placement.height).toBeLessThanOrEqual(result.height - 4);
    }
  });

  it('reports power-of-two and square extents that still contain every placement', () => {
    const rects: PackableRectangle[] = [
      { id: 'a', width: 30, height: 20 },
      { id: 'b', width: 17, height: 41 },
      { id: 'c', width: 25, height: 9 },
    ];

    const result = packRectangles(rects, { powerOfTwo: true, square: true });
    expect(isPowerOfTwo(result.width)).toBe(true);
    expect(isPowerOfTwo(result.height)).toBe(true);
    expect(result.width).toBe(result.height);

    for (const placement of result.placements) {
      expect(placement.x + placement.width).toBeLessThanOrEqual(result.width);
      expect(placement.y + placement.height).toBeLessThanOrEqual(result.height);
    }
  });

  it('rotates a rectangle when rotation is required to fit a fixed bin', () => {
    const rects: PackableRectangle[] = [{ id: 'tall', width: 8, height: 20 }];
    const options = { growable: false as const, maxWidth: 20, maxHeight: 8 };

    const withRotation = packRectangles(rects, { ...options, allowRotation: true });
    expect(withRotation.unpacked).toEqual([]);
    expect(withRotation.placements).toHaveLength(1);
    const placed = withRotation.placements[0];
    expect(placed.rotated).toBe(true);
    expect(placed.width).toBe(20);
    expect(placed.height).toBe(8);

    const withoutRotation = packRectangles(rects, { ...options, allowRotation: false });
    expect(withoutRotation.placements).toEqual([]);
    expect(withoutRotation.unpacked).toEqual(['tall']);
  });

  it('grows to fit a rectangle that would need rotation in a fixed bin', () => {
    const rects: PackableRectangle[] = [{ id: 'tall', width: 8, height: 20 }];
    const result = packRectangles(rects, { allowRotation: false });
    expect(result.unpacked).toEqual([]);
    expect(result.placements[0].rotated).toBe(false);
    expect(result.placements[0].width).toBe(8);
    expect(result.placements[0].height).toBe(20);
  });

  it('produces a deep-equal result for the same input packed twice', () => {
    const rects: PackableRectangle[] = [];
    for (let i = 0; i < 15; i++) {
      rects.push({ id: `r${i}`, width: 5 + ((i * 11) % 30), height: 5 + ((i * 17) % 28) });
    }
    const options = { padding: 1, border: 3, allowRotation: true };

    const first = packRectangles(rects, options);
    const second = packRectangles(rects, options);
    expect(second).toEqual(first);
  });

  it('returns an empty result with a zero-size bin for empty input', () => {
    const result = packRectangles([]);
    expect(result).toEqual({ placements: [], width: 0, height: 0, unpacked: [] });
  });

  it('packs a single rectangle at the border corner', () => {
    const result = packRectangles([{ id: 'only', width: 12, height: 7 }], { border: 3 });
    expect(result.unpacked).toEqual([]);
    expect(result.placements).toEqual([{ id: 'only', x: 3, y: 3, width: 12, height: 7, rotated: false }]);
    expect(result.width).toBe(18);
    expect(result.height).toBe(13);
  });

  it('reports a rectangle larger than a fixed bin as unpacked', () => {
    const result = packRectangles([{ id: 'big', width: 500, height: 500 }], {
      growable: false,
      maxWidth: 64,
      maxHeight: 64,
    });
    expect(result.placements).toEqual([]);
    expect(result.unpacked).toEqual(['big']);
  });

  it('reports a rectangle larger than the growth cap as unpacked', () => {
    const result = packRectangles([{ id: 'huge', width: 200, height: 10 }], { maxWidth: 64, maxHeight: 64 });
    expect(result.unpacked).toEqual(['huge']);
  });
});

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function rectanglesOverlap(a: Readonly<PackedRectangle>, b: Readonly<PackedRectangle>): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}
