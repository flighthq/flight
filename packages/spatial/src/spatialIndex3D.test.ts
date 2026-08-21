import type { SpatialAabb3D, SpatialObjectId, SpatialPair } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  clearSpatialIndex3D,
  createSpatialIndex3D,
  insertSpatialObject3D,
  querySpatialPairs3D,
  querySpatialPoint3D,
  querySpatialRay3D,
  querySpatialRegion3D,
  removeSpatialObject3D,
  updateSpatialObject3D,
} from './spatialIndex3D';
import { createUniformGridSpatialBackend3D } from './uniformGrid3D';

function box(minX: number, minY: number, minZ: number, size: number): SpatialAabb3D {
  return { minX, minY, minZ, maxX: minX + size, maxY: minY + size, maxZ: minZ + size };
}

describe('clearSpatialIndex3D', () => {
  it('empties the index while keeping it reusable', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 10));
    clearSpatialIndex3D(index);

    const out: SpatialObjectId[] = [];
    querySpatialPoint3D(index, 5, 5, 5, out);
    expect(out).toEqual([]);

    insertSpatialObject3D(index, 2, box(0, 0, 0, 10));
    querySpatialPoint3D(index, 5, 5, 5, out);
    expect(out).toEqual([2]);
  });
});

describe('createSpatialIndex3D', () => {
  it('defaults to a uniform grid that indexes and answers queries', () => {
    const index = createSpatialIndex3D();
    expect(insertSpatialObject3D(index, 1, box(0, 0, 0, 10))).toBe(true);
    const out: SpatialObjectId[] = [];
    querySpatialPoint3D(index, 5, 5, 5, out);
    expect(out).toEqual([1]);
  });

  it('dispatches through an explicitly supplied backend', () => {
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(1));
    insertSpatialObject3D(index, 1, box(0, 0, 0, 0.5));
    insertSpatialObject3D(index, 2, box(10, 10, 10, 0.5));
    const pairs: SpatialPair[] = [];
    querySpatialPairs3D(index, pairs);
    expect(pairs).toEqual([]);
  });

  it('has no import-time side effect — two indexes are independent', () => {
    const a = createSpatialIndex3D();
    const b = createSpatialIndex3D();
    insertSpatialObject3D(a, 1, box(0, 0, 0, 10));
    const out: SpatialObjectId[] = [];
    querySpatialPoint3D(b, 5, 5, 5, out);
    expect(out).toEqual([]);
  });
});

describe('insertSpatialObject3D', () => {
  it('returns false for bounds that cannot be indexed at all', () => {
    const index = createSpatialIndex3D();
    expect(insertSpatialObject3D(index, 1, { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: Infinity })).toBe(
      false,
    );
    const out: SpatialObjectId[] = [];
    querySpatialRegion3D(index, { minX: -1e9, minY: -1e9, minZ: -1e9, maxX: 1e9, maxY: 1e9, maxZ: 1e9 }, out);
    expect(out).toEqual([]);
  });
});

describe('querySpatialPairs3D', () => {
  it('reports a co-located pair once', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 10));
    insertSpatialObject3D(index, 2, box(1, 1, 1, 10));
    const out: SpatialPair[] = [];
    querySpatialPairs3D(index, out);
    expect(out).toEqual([{ a: 1, b: 2 }]);
  });
});

describe('querySpatialPoint3D', () => {
  it('respects the third axis', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, { minX: 0, minY: 0, minZ: 0, maxX: 100, maxY: 100, maxZ: 10 });
    const out: SpatialObjectId[] = [];
    querySpatialPoint3D(index, 50, 50, 5, out);
    expect(out).toEqual([1]);
    querySpatialPoint3D(index, 50, 50, 50, out);
    expect(out).toEqual([]);
  });
});

describe('querySpatialRay3D', () => {
  it('finds an object along a z-directed ray', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 500, 10));
    const out: SpatialObjectId[] = [];
    querySpatialRay3D(index, 5, 5, 0, 0, 0, 1, out);
    expect(out).toEqual([1]);
  });
});

describe('querySpatialRegion3D', () => {
  it('returns overlapping objects and excludes disjoint ones', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 10));
    insertSpatialObject3D(index, 2, box(1000, 1000, 1000, 10));
    const out: SpatialObjectId[] = [];
    querySpatialRegion3D(index, box(0, 0, 0, 20), out);
    expect(out).toEqual([1]);
  });
});

describe('removeSpatialObject3D', () => {
  it('drops the object and is a no-op for an unknown id', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 10));
    removeSpatialObject3D(index, 1);
    expect(() => removeSpatialObject3D(index, 99)).not.toThrow();
    const out: SpatialObjectId[] = [];
    querySpatialPoint3D(index, 5, 5, 5, out);
    expect(out).toEqual([]);
  });
});

describe('updateSpatialObject3D', () => {
  it('behaves as insert for a not-yet-present id', () => {
    const index = createSpatialIndex3D();
    expect(updateSpatialObject3D(index, 1, box(0, 0, 0, 10))).toBe(true);
    const out: SpatialObjectId[] = [];
    querySpatialPoint3D(index, 5, 5, 5, out);
    expect(out).toEqual([1]);
  });

  it('moves an object so the old position stops matching', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 10));
    updateSpatialObject3D(index, 1, box(1000, 1000, 1000, 10));
    const out: SpatialObjectId[] = [];
    querySpatialPoint3D(index, 5, 5, 5, out);
    expect(out).toEqual([]);
    querySpatialPoint3D(index, 1005, 1005, 1005, out);
    expect(out).toEqual([1]);
  });
});
