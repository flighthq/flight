import type { SpatialIndex, SpatialObjectId, SpatialPair } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  clearSpatialIndex,
  createSpatialIndex,
  insertSpatialObject,
  querySpatialPairs,
  querySpatialPoint,
  querySpatialRay,
  querySpatialRegion,
  removeSpatialObject,
  updateSpatialObject,
} from './spatialIndex';
import { createUniformGridSpatialBackend } from './uniformGrid';

function makeIndex(cellSize = 10): SpatialIndex {
  return createSpatialIndex(createUniformGridSpatialBackend(cellSize));
}

// Sorts pairs into canonical "a-b" strings so a result can be compared as a set regardless of order.
function pairKeys(pairs: readonly SpatialPair[]): string[] {
  return pairs.map((p) => `${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}`).sort();
}

describe('clearSpatialIndex', () => {
  it('empties every query after clearing', () => {
    const index = makeIndex();
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    clearSpatialIndex(index);

    const pairs: SpatialPair[] = [];
    querySpatialPairs(index, pairs);
    expect(pairs).toHaveLength(0);

    const region: SpatialObjectId[] = [];
    querySpatialRegion(index, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, region);
    expect(region).toHaveLength(0);

    const point: SpatialObjectId[] = [];
    querySpatialPoint(index, 3, 3, point);
    expect(point).toHaveLength(0);
  });
});

describe('createSpatialIndex', () => {
  it('defaults to a working uniform grid when given no backend', () => {
    const index = createSpatialIndex();
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject(index, 2, { minX: 1, minY: 1, maxX: 5, maxY: 5 });

    const pairs: SpatialPair[] = [];
    querySpatialPairs(index, pairs);
    expect(pairKeys(pairs)).toEqual(['1-2']);
  });

  it('uses an explicitly supplied backend', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(64));
    insertSpatialObject(index, 7, { minX: 0, minY: 0, maxX: 4, maxY: 4 });

    const point: SpatialObjectId[] = [];
    querySpatialPoint(index, 2, 2, point);
    expect(point).toEqual([7]);
  });
});

describe('insertSpatialObject', () => {
  it('yields exactly the one overlapping pair from two overlapping objects and one far object', () => {
    const index = makeIndex();
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });
    insertSpatialObject(index, 3, { minX: 100, minY: 100, maxX: 104, maxY: 104 });

    const pairs: SpatialPair[] = [];
    querySpatialPairs(index, pairs);

    expect(pairs).toHaveLength(1);
    expect(pairKeys(pairs)).toEqual(['1-2']);
    for (const pair of pairs) expect(pair.a).not.toBe(pair.b);
  });
});

describe('querySpatialPairs', () => {
  it('reuses and clears the out array across calls', () => {
    const index = makeIndex();
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    const out: SpatialPair[] = [];
    querySpatialPairs(index, out);
    expect(out).toHaveLength(1);

    removeSpatialObject(index, 2);
    querySpatialPairs(index, out);
    expect(out).toHaveLength(0);
  });
});

describe('querySpatialPoint', () => {
  it('returns an object at an interior point and nothing at an empty point', () => {
    const index = makeIndex();
    insertSpatialObject(index, 1, { minX: 1, minY: 1, maxX: 3, maxY: 3 });
    insertSpatialObject(index, 2, { minX: 8, minY: 8, maxX: 9, maxY: 9 });

    const inside: SpatialObjectId[] = [];
    querySpatialPoint(index, 2, 2, inside);
    expect(inside).toEqual([1]);

    const outside: SpatialObjectId[] = [];
    querySpatialPoint(index, 6, 6, outside);
    expect(outside).toHaveLength(0);
  });
});

describe('querySpatialRay', () => {
  it('returns an object the ray crosses and nothing for a ray that misses', () => {
    const index = makeIndex();
    insertSpatialObject(index, 1, { minX: 20, minY: 20, maxX: 24, maxY: 24 });

    const hit: SpatialObjectId[] = [];
    querySpatialRay(index, 0, 22, 1, 0, hit);
    expect(hit).toEqual([1]);

    const miss: SpatialObjectId[] = [];
    querySpatialRay(index, 0, 0, 1, 0, miss);
    expect(miss).toHaveLength(0);
  });
});

describe('querySpatialRegion', () => {
  it('includes overlapping bounds and excludes a cell-mate whose bounds miss the region', () => {
    const index = makeIndex();
    // Both objects share grid cell (0,0), but only object 1 actually overlaps the query region.
    insertSpatialObject(index, 1, { minX: 1, minY: 1, maxX: 3, maxY: 3 });
    insertSpatialObject(index, 2, { minX: 8, minY: 8, maxX: 9, maxY: 9 });

    const out: SpatialObjectId[] = [];
    querySpatialRegion(index, { minX: 0, minY: 0, maxX: 4, maxY: 4 }, out);

    expect(out).toEqual([1]);
  });
});

describe('removeSpatialObject', () => {
  it('drops the object from pair, region, and point queries', () => {
    const index = makeIndex();
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    removeSpatialObject(index, 2);

    const pairs: SpatialPair[] = [];
    querySpatialPairs(index, pairs);
    expect(pairs).toHaveLength(0);

    const region: SpatialObjectId[] = [];
    querySpatialRegion(index, { minX: 0, minY: 0, maxX: 6, maxY: 6 }, region);
    expect(region).toEqual([1]);

    const point: SpatialObjectId[] = [];
    querySpatialPoint(index, 5, 5, point);
    expect(point).toHaveLength(0);
  });
});

describe('updateSpatialObject', () => {
  it('removes a pair once the moved object leaves the shared region', () => {
    const index = makeIndex();
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    insertSpatialObject(index, 2, { minX: 2, minY: 2, maxX: 6, maxY: 6 });

    const before: SpatialPair[] = [];
    querySpatialPairs(index, before);
    expect(before).toHaveLength(1);

    updateSpatialObject(index, 2, { minX: 200, minY: 200, maxX: 204, maxY: 204 });

    const after: SpatialPair[] = [];
    querySpatialPairs(index, after);
    expect(after).toHaveLength(0);
  });
});
