import type { CollisionAabb2D, CollisionObb2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { writeAabbVertices, writeObbVertices } from './convexVertices';

describe('writeAabbVertices', () => {
  it('writes the four corners counter-clockwise from the min corner', () => {
    const out = new Float64Array(8);
    const aabb: CollisionAabb2D = { minX: 1, minY: 2, maxX: 5, maxY: 8 };
    writeAabbVertices(aabb, out);
    expect(Array.from(out)).toEqual([1, 2, 5, 2, 5, 8, 1, 8]);
  });

  it('writes a degenerate box as four coincident corners rather than skipping any', () => {
    const out = new Float64Array(8);
    const aabb: CollisionAabb2D = { minX: 3, minY: 3, maxX: 3, maxY: 3 };
    writeAabbVertices(aabb, out);
    expect(Array.from(out)).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
  });
});

describe('writeObbVertices', () => {
  it('matches the equivalent axis-aligned box at zero rotation', () => {
    const obb = new Float64Array(8);
    const aabb = new Float64Array(8);
    writeObbVertices({ x: 3, y: 4, halfW: 1, halfH: 2, rotation: 0 }, obb);
    writeAabbVertices({ minX: 2, minY: 2, maxX: 4, maxY: 6 }, aabb);
    for (let i = 0; i < 8; i++) expect(obb[i]).toBeCloseTo(aabb[i]);
  });

  it('rotates the corners about the center, preserving the distance to it', () => {
    const out = new Float64Array(8);
    const obb: CollisionObb2D = { x: 0, y: 0, halfW: 3, halfH: 4, rotation: Math.PI / 3 };
    writeObbVertices(obb, out);
    const expected = Math.sqrt(3 * 3 + 4 * 4);
    for (let i = 0; i < 4; i++) {
      const x = out[i << 1];
      const y = out[(i << 1) + 1];
      expect(Math.sqrt(x * x + y * y)).toBeCloseTo(expected);
    }
  });

  it('turns a quarter rotation into a swap of the half-extents', () => {
    const out = new Float64Array(8);
    writeObbVertices({ x: 0, y: 0, halfW: 1, halfH: 5, rotation: Math.PI / 2 }, out);
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 4; i++) {
      maxX = Math.max(maxX, out[i << 1]);
      maxY = Math.max(maxY, out[(i << 1) + 1]);
    }
    expect(maxX).toBeCloseTo(5);
    expect(maxY).toBeCloseTo(1);
  });
});
