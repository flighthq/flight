import type { SpatialAabb3D, SpatialFrustum3D, SpatialObjectId, SpatialPair } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  clearSpatialIndex3D,
  createSpatialIndex3D,
  initializeSpatialIndex3D,
  insertSpatialObject3D,
  querySpatialFrustum3D,
  querySpatialPairs3D,
  querySpatialPoint3D,
  querySpatialRay3D,
  querySpatialRegion3D,
  querySpatialSphere3D,
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

describe('initializeSpatialIndex3D', () => {
  it('is the construction initializer of createSpatialIndex3D', () => {
    expect(typeof initializeSpatialIndex3D).toBe('function');
  });
});

// A frustum looking down +Z: a small near quad at z=0 widening to a large far quad at z=400. Corner
// order is the contracted one — four near corners, then the four far corners in the SAME winding.
function viewFrustum(nearHalf: number, farHalf: number, farZ: number): SpatialFrustum3D {
  return {
    corners: [
      -nearHalf,
      -nearHalf,
      0,
      nearHalf,
      -nearHalf,
      0,
      nearHalf,
      nearHalf,
      0,
      -nearHalf,
      nearHalf,
      0,
      -farHalf,
      -farHalf,
      farZ,
      farHalf,
      -farHalf,
      farZ,
      farHalf,
      farHalf,
      farZ,
      -farHalf,
      farHalf,
      farZ,
    ],
  };
}

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

describe('querySpatialFrustum3D', () => {
  it('finds an object inside the volume and excludes one far outside it', () => {
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(32));
    insertSpatialObject3D(index, 1, box(-5, -5, 100, 10));
    insertSpatialObject3D(index, 2, box(900, 900, 100, 10));
    const out: SpatialObjectId[] = [];
    querySpatialFrustum3D(index, viewFrustum(10, 200, 400), out);
    expect(out).toContain(1);
    expect(out).not.toContain(2);
  });

  it('reports each object once even when it straddles several slices', () => {
    // A long object spanning most of the depth touches many slices. Without the dedup it would appear
    // once per slice, so a caller counting results would over-count exactly the largest objects.
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(32));
    insertSpatialObject3D(index, 7, { maxX: 5, maxY: 5, maxZ: 380, minX: -5, minY: -5, minZ: 10 });
    const out: SpatialObjectId[] = [];
    querySpatialFrustum3D(index, viewFrustum(10, 200, 400), out, 8);
    expect(out.filter((id) => id === 7)).toHaveLength(1);
  });

  it('covers strictly less than the single bounding box as slices increase', () => {
    // The point of slicing. An object out near the far corners of the frustum's own AABB but well
    // outside the cone is a candidate at one slice and rejected at many.
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(32));
    insertSpatialObject3D(index, 3, box(180, 180, 20, 8));
    const coarse: SpatialObjectId[] = [];
    const fine: SpatialObjectId[] = [];
    querySpatialFrustum3D(index, viewFrustum(10, 200, 400), coarse, 1);
    querySpatialFrustum3D(index, viewFrustum(10, 200, 400), fine, 16);
    expect(coarse).toContain(3);
    expect(fine).not.toContain(3);
  });

  it('returns nothing for a malformed corner list rather than guessing', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 10));
    const out: SpatialObjectId[] = [];
    querySpatialFrustum3D(index, { corners: [0, 0, 0] }, out);
    expect(out).toEqual([]);
    querySpatialFrustum3D(index, viewFrustum(10, 200, 400), out, 0);
    expect(out).toEqual([]);
  });

  it('clears the output before filling it', () => {
    const index = createSpatialIndex3D();
    const out: SpatialObjectId[] = [99];
    querySpatialFrustum3D(index, viewFrustum(10, 200, 400), out);
    expect(out).not.toContain(99);
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

describe('querySpatialSphere3D', () => {
  it('finds objects within the radius and excludes those beyond it', () => {
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(16));
    insertSpatialObject3D(index, 1, box(0, 0, 0, 4));
    insertSpatialObject3D(index, 2, box(500, 500, 500, 4));
    const out: SpatialObjectId[] = [];
    querySpatialSphere3D(index, 0, 0, 0, 20, out);
    expect(out).toContain(1);
    expect(out).not.toContain(2);
  });

  it('is a candidate set over the bounding cube, not an exact sphere test', () => {
    // The corner of the cube reaches past the sphere by root three. This object sits in that corner —
    // outside the sphere, inside the cube — and IS returned. Documented behaviour rather than a defect:
    // the caller applies the exact distance test to what comes back.
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(16));
    insertSpatialObject3D(index, 5, box(9, 9, 9, 0.5));
    const out: SpatialObjectId[] = [];
    querySpatialSphere3D(index, 0, 0, 0, 10, out);
    expect(Math.hypot(9, 9, 9)).toBeGreaterThan(10);
    expect(out).toContain(5);
  });

  it('returns nothing for a non-finite centre or negative radius', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 4));
    const out: SpatialObjectId[] = [];
    querySpatialSphere3D(index, NaN, 0, 0, 10, out);
    expect(out).toEqual([]);
    querySpatialSphere3D(index, 0, 0, 0, -1, out);
    expect(out).toEqual([]);
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
