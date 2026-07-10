import type { SpatialAabb, SpatialObjectId, SpatialPair } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createUniformGridSpatialBackend } from './uniformGrid';

// A plain AABB-overlap confirmation used to turn broadphase candidate pairs into confirmed pairs (the
// narrow-phase stand-in): exactly the check the caller would apply downstream.
function boundsOverlap(a: Readonly<SpatialAabb>, b: Readonly<SpatialAabb>): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function pairKeys(pairs: readonly SpatialPair[]): string[] {
  return pairs.map((p) => `${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}`).sort();
}

describe('createUniformGridSpatialBackend', () => {
  it('emits a pair spanning several shared cells exactly once', () => {
    const grid = createUniformGridSpatialBackend(10);
    // Both objects cover the same 3x3 block of cells (0..2, 0..2), so they co-occupy nine cells.
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 25, maxY: 25 });
    grid.insertSpatialObject(2, { minX: 5, minY: 5, maxX: 29, maxY: 29 });

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);

    expect(pairs).toHaveLength(1);
    expect(pairKeys(pairs)).toEqual(['1-2']);
  });

  it('never pairs an object with itself', () => {
    const grid = createUniformGridSpatialBackend(10);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairs).toHaveLength(0);
  });

  it('returns nothing from every query on an empty grid', () => {
    const grid = createUniformGridSpatialBackend(10);

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairs).toHaveLength(0);

    const region: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -50, minY: -50, maxX: 50, maxY: 50 }, region);
    expect(region).toHaveLength(0);

    const point: SpatialObjectId[] = [];
    grid.querySpatialPoint(0, 0, point);
    expect(point).toHaveLength(0);

    const ray: SpatialObjectId[] = [];
    grid.querySpatialRay(0, 0, 1, 1, ray);
    expect(ray).toHaveLength(0);
  });

  it('indexes objects at negative coordinates', () => {
    const grid = createUniformGridSpatialBackend(10);
    grid.insertSpatialObject(1, { minX: -8, minY: -8, maxX: -4, maxY: -4 });
    grid.insertSpatialObject(2, { minX: -6, minY: -6, maxX: -2, maxY: -2 });

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairKeys(pairs)).toEqual(['1-2']);

    const point: SpatialObjectId[] = [];
    grid.querySpatialPoint(-5, -5, point);
    expect(point.sort()).toEqual([1, 2]);
  });

  it('gives the same confirmed pairs across different cell sizes', () => {
    const objects: { id: SpatialObjectId; bounds: SpatialAabb }[] = [
      { id: 1, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { id: 2, bounds: { minX: 5, minY: 5, maxX: 15, maxY: 15 } },
      { id: 3, bounds: { minX: 12, minY: 12, maxX: 20, maxY: 20 } },
      { id: 4, bounds: { minX: 100, minY: 100, maxX: 110, maxY: 110 } },
    ];
    const boundsOf = new Map(objects.map((o) => [o.id, o.bounds]));

    function confirmedPairs(cellSize: number): string[] {
      const grid = createUniformGridSpatialBackend(cellSize);
      for (const o of objects) grid.insertSpatialObject(o.id, o.bounds);
      const candidates: SpatialPair[] = [];
      grid.querySpatialPairs(candidates);
      const confirmed = candidates.filter((p) => boundsOverlap(boundsOf.get(p.a)!, boundsOf.get(p.b)!));
      return pairKeys(confirmed);
    }

    const fine = confirmedPairs(10);
    const coarse = confirmedPairs(64);

    expect(fine).toEqual(['1-2', '2-3']);
    expect(coarse).toEqual(fine);
  });
});
