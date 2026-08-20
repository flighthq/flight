import type { SpatialIndex2D, SpatialObjectId, SpatialPair } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  clearSpatialIndex2D,
  createSpatialIndex2D,
  insertSpatialObject2D,
  querySpatialPairs2D,
  querySpatialPoint2D,
  querySpatialRay2D,
  querySpatialRegion2D,
  removeSpatialObject2D,
  updateSpatialObject2D,
} from './spatialIndex';
import { createUniformGridSpatialBackend2D } from './uniformGrid';

function makeIndex(cellSize = 10): SpatialIndex2D {
  return createSpatialIndex2D(createUniformGridSpatialBackend2D(cellSize));
}

// Sorts pairs into canonical "a-b" strings so a result can be compared as a set regardless of order.
function pairKeys(pairs: readonly SpatialPair[]): string[] {
  return pairs.map((p) => `${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}`).sort();
}

describe('clearSpatialIndex2D', () => {
  it('empties every query after clearing', () => {
    const index = makeIndex();
    insertSpatialObject2D(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject2D(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    clearSpatialIndex2D(index);

    const pairs: SpatialPair[] = [];
    querySpatialPairs2D(index, pairs);
    expect(pairs).toHaveLength(0);

    const region: SpatialObjectId[] = [];
    querySpatialRegion2D(index, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, region);
    expect(region).toHaveLength(0);

    const point: SpatialObjectId[] = [];
    querySpatialPoint2D(index, 3, 3, point);
    expect(point).toHaveLength(0);
  });
});

describe('createSpatialIndex2D', () => {
  it('defaults to a working uniform grid when given no backend', () => {
    const index = createSpatialIndex2D();
    insertSpatialObject2D(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject2D(index, 2, { minX: 1, minY: 1, maxX: 5, maxY: 5 });

    const pairs: SpatialPair[] = [];
    querySpatialPairs2D(index, pairs);
    expect(pairKeys(pairs)).toEqual(['1-2']);
  });

  it('uses an explicitly supplied backend', () => {
    const index = createSpatialIndex2D(createUniformGridSpatialBackend2D(64));
    insertSpatialObject2D(index, 7, { minX: 0, minY: 0, maxX: 4, maxY: 4 });

    const point: SpatialObjectId[] = [];
    querySpatialPoint2D(index, 2, 2, point);
    expect(point).toEqual([7]);
  });
});

describe('insertSpatialObject2D', () => {
  it('yields exactly the one overlapping pair from two overlapping objects and one far object', () => {
    const index = makeIndex();
    insertSpatialObject2D(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject2D(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });
    insertSpatialObject2D(index, 3, { minX: 100, minY: 100, maxX: 104, maxY: 104 });

    const pairs: SpatialPair[] = [];
    querySpatialPairs2D(index, pairs);

    expect(pairs).toHaveLength(1);
    expect(pairKeys(pairs)).toEqual(['1-2']);
    for (const pair of pairs) expect(pair.a).not.toBe(pair.b);
  });
});

describe('querySpatialPairs2D', () => {
  it('reuses and clears the out array across calls', () => {
    const index = makeIndex();
    insertSpatialObject2D(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject2D(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    const out: SpatialPair[] = [];
    querySpatialPairs2D(index, out);
    expect(out).toHaveLength(1);

    removeSpatialObject2D(index, 2);
    querySpatialPairs2D(index, out);
    expect(out).toHaveLength(0);
  });
});

describe('querySpatialPoint2D', () => {
  it('returns an object at an interior point and nothing at an empty point', () => {
    const index = makeIndex();
    insertSpatialObject2D(index, 1, { minX: 1, minY: 1, maxX: 3, maxY: 3 });
    insertSpatialObject2D(index, 2, { minX: 8, minY: 8, maxX: 9, maxY: 9 });

    const inside: SpatialObjectId[] = [];
    querySpatialPoint2D(index, 2, 2, inside);
    expect(inside).toEqual([1]);

    const outside: SpatialObjectId[] = [];
    querySpatialPoint2D(index, 6, 6, outside);
    expect(outside).toHaveLength(0);
  });
});

describe('querySpatialRay2D', () => {
  it('returns an object the ray crosses and nothing for a ray that misses', () => {
    const index = makeIndex();
    insertSpatialObject2D(index, 1, { minX: 20, minY: 20, maxX: 24, maxY: 24 });

    const hit: SpatialObjectId[] = [];
    querySpatialRay2D(index, 0, 22, 1, 0, hit);
    expect(hit).toEqual([1]);

    const miss: SpatialObjectId[] = [];
    querySpatialRay2D(index, 0, 0, 1, 0, miss);
    expect(miss).toHaveLength(0);
  });
});

describe('querySpatialRegion2D', () => {
  it('includes overlapping bounds and excludes a cell-mate whose bounds miss the region', () => {
    const index = makeIndex();
    // Both objects share grid cell (0,0), but only object 1 actually overlaps the query region.
    insertSpatialObject2D(index, 1, { minX: 1, minY: 1, maxX: 3, maxY: 3 });
    insertSpatialObject2D(index, 2, { minX: 8, minY: 8, maxX: 9, maxY: 9 });

    const out: SpatialObjectId[] = [];
    querySpatialRegion2D(index, { minX: 0, minY: 0, maxX: 4, maxY: 4 }, out);

    expect(out).toEqual([1]);
  });
});

describe('removeSpatialObject2D', () => {
  it('drops the object from pair, region, and point queries', () => {
    const index = makeIndex();
    insertSpatialObject2D(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject2D(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    removeSpatialObject2D(index, 2);

    const pairs: SpatialPair[] = [];
    querySpatialPairs2D(index, pairs);
    expect(pairs).toHaveLength(0);

    const region: SpatialObjectId[] = [];
    querySpatialRegion2D(index, { minX: 0, minY: 0, maxX: 6, maxY: 6 }, region);
    expect(region).toEqual([1]);

    const point: SpatialObjectId[] = [];
    querySpatialPoint2D(index, 5, 5, point);
    expect(point).toHaveLength(0);
  });
});

describe('updateSpatialObject2D', () => {
  it('removes a pair once the moved object leaves the shared region', () => {
    const index = makeIndex();
    insertSpatialObject2D(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject2D(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    const before: SpatialPair[] = [];
    querySpatialPairs2D(index, before);
    expect(before).toHaveLength(1);

    updateSpatialObject2D(index, 2, { minX: 200, minY: 200, maxX: 204, maxY: 204 });

    const after: SpatialPair[] = [];
    querySpatialPairs2D(index, after);
    expect(after).toHaveLength(0);
  });
});
