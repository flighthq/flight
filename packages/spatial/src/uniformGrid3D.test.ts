import type { SpatialAabb3D, SpatialIndexingNotice, SpatialObjectId, SpatialPair } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { setSpatialIndexingGuard } from './spatialIndexingGuard';
import { MAX_INDEXED_CELLS_PER_OBJECT } from './uniformGrid';
import { createUniformGridSpatialBackend3D } from './uniformGrid3D';

afterEach(() => {
  setSpatialIndexingGuard(null);
});

function box(minX: number, minY: number, minZ: number, size: number): SpatialAabb3D {
  return { minX, minY, minZ, maxX: minX + size, maxY: minY + size, maxZ: minZ + size };
}

describe('createUniformGridSpatialBackend3D', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createUniformGridSpatialBackend3D(10)).toBe(true);
  });

  it('clears every object while staying reusable', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    grid.insertSpatialObject(2, { minX: 0, minY: 0, minZ: 0, maxX: 1e9, maxY: 1e9, maxZ: 1e9 });
    grid.clearSpatialIndex();

    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(1, 1, 1, out);
    expect(out).toEqual([]);
    expect(grid.explainSpatialIndexing(1).mode).toBe('absent');
    expect(grid.explainSpatialIndexing(2).mode).toBe('absent');

    grid.insertSpatialObject(3, box(0, 0, 0, 5));
    grid.querySpatialPoint(1, 1, 1, out);
    expect(out).toEqual([3]);
  });

  it('copies the bounds so a caller may reuse its own object', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    const bounds = box(1, 1, 1, 4);
    grid.insertSpatialObject(1, bounds);
    bounds.minX = -500;
    bounds.maxZ = 500;

    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(-400, 1, 1, out);
    expect(out).toEqual([]);
    grid.querySpatialPoint(2, 2, 2, out);
    expect(out).toEqual([1]);
  });

  it('declines non-finite and inverted bounds along the z axis too', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    expect(grid.insertSpatialObject(1, { minX: 0, minY: 0, minZ: NaN, maxX: 1, maxY: 1, maxZ: 1 })).toBe(false);
    expect(grid.insertSpatialObject(2, { minX: 0, minY: 0, minZ: 5, maxX: 1, maxY: 1, maxZ: 0 })).toBe(false);
    expect(grid.explainSpatialIndexing(1).reason).toBe('non-finite-bounds');
    expect(grid.explainSpatialIndexing(2).reason).toBe('inverted-bounds');

    const out: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1e6, minY: -1e6, minZ: -1e6, maxX: 1e6, maxY: 1e6, maxZ: 1e6 }, out);
    expect(out).toEqual([]);
  });

  it('routes an object past the per-object cell budget to overflow and keeps it queryable', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    // 11 cells on a side is 1331 cells — past the budget, where 10 on a side (1000) is inside it.
    expect(grid.insertSpatialObject(1, box(0, 0, 0, 10.5))).toBe(true);
    expect(grid.explainSpatialIndexing(1).mode).toBe('overflow');

    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(5, 5, 5, out);
    expect(out).toEqual([1]);
    grid.querySpatialRegion(box(2, 2, 2, 1), out);
    expect(out).toEqual([1]);
    grid.querySpatialRay(-100, 5, 5, 1, 0, 0, out);
    expect(out).toEqual([1]);
  });

  it('holds an object exactly at the budget in cells rather than overflow', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    // 0..9.5 spans cells 0..9 on each axis: 10*10*10 = 1000 <= 1024.
    grid.insertSpatialObject(1, box(0, 0, 0, 9.5));
    const explanation = grid.explainSpatialIndexing(1);
    expect(explanation.mode).toBe('cells');
    expect(explanation.bucketCount).toBe(1000);
    expect(explanation.bucketCount).toBeLessThanOrEqual(MAX_INDEXED_CELLS_PER_OBJECT);
  });

  it('reports the span the bound refused to walk, which grows cubically', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(7, box(0, 0, 0, 19));
    expect(notices).toEqual([
      {
        cellSize: 1,
        id: 7,
        mode: 'overflow',
        operation: 'insert',
        reason: null,
        wouldOccupyBucketCount: 8000,
      },
    ]);
  });

  it('keeps results correct through overflow when the cell size is invalid', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend3D(0);
    expect(grid.insertSpatialObject(1, box(0, 0, 0, 10))).toBe(true);
    // The explanation reports HOW the object is held; only the notice carries WHY it was routed
    // there, which is why a caller diagnosing a bad cell size needs the guard rather than the pull
    // query. Same split as the 2D grid.
    expect(grid.explainSpatialIndexing(1)).toEqual({ bucketCount: 0, id: 1, mode: 'overflow', reason: null });
    expect(notices.map((notice) => notice.reason)).toEqual(['invalid-cell-size']);

    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(5, 5, 5, out);
    expect(out).toEqual([1]);
  });

  it('removes an object from every cell it covered', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 25));
    grid.removeSpatialObject(1);
    const out: SpatialObjectId[] = [];
    for (const c of [1, 11, 21]) {
      grid.querySpatialPoint(c, c, c, out);
      expect(out).toEqual([]);
    }
    expect(grid.explainSpatialIndexing(1).mode).toBe('absent');
  });
});

describe('querySpatialPairs3D', () => {
  it('emits a co-located pair exactly once even when it shares many cells', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(1, box(0, 0, 0, 3.5));
    grid.insertSpatialObject(2, box(0.5, 0.5, 0.5, 3.5));
    const out: SpatialPair[] = [];
    grid.querySpatialPairs(out);
    expect(out).toEqual([{ a: 1, b: 2 }]);
  });

  it('never emits an object with itself and orders ids ascending', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(9, box(0, 0, 0, 5));
    grid.insertSpatialObject(4, box(1, 1, 1, 5));
    const out: SpatialPair[] = [];
    grid.querySpatialPairs(out);
    expect(out).toEqual([{ a: 4, b: 9 }]);
  });

  it('separates objects that share no cell', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(1, box(0, 0, 0, 0.5));
    grid.insertSpatialObject(2, box(0, 0, 50, 0.5));
    const out: SpatialPair[] = [];
    grid.querySpatialPairs(out);
    expect(out).toEqual([]);
  });

  it('pairs an overflowed object only against objects it really overlaps', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(1, box(0, 0, 0, 40));
    expect(grid.explainSpatialIndexing(1).mode).toBe('overflow');
    grid.insertSpatialObject(2, box(5, 5, 5, 1));
    grid.insertSpatialObject(3, box(500, 500, 500, 1));

    const out: SpatialPair[] = [];
    grid.querySpatialPairs(out);
    expect(out).toEqual([{ a: 1, b: 2 }]);
  });

  it('clears the out array between queries', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    grid.insertSpatialObject(2, box(1, 1, 1, 5));
    const out: SpatialPair[] = [];
    grid.querySpatialPairs(out);
    grid.querySpatialPairs(out);
    expect(out).toEqual([{ a: 1, b: 2 }]);
  });

  it('retains pair objects across a steady-topology query', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    grid.insertSpatialObject(2, box(1, 1, 1, 5));
    const out: SpatialPair[] = [];
    grid.querySpatialPairs(out);
    const pair = out[0];

    grid.querySpatialPairs(out);

    expect(out[0]).toBe(pair);
  });
});

describe('querySpatialPoint3D', () => {
  it('confirms a cell co-occupant against its real bounds', () => {
    const grid = createUniformGridSpatialBackend3D(100);
    grid.insertSpatialObject(1, box(0, 0, 0, 1));
    grid.insertSpatialObject(2, box(50, 50, 50, 1));
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(0.5, 0.5, 0.5, out);
    expect(out).toEqual([1]);
  });

  it('separates points that differ only in z', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, minZ: 0, maxX: 100, maxY: 100, maxZ: 5 });
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(50, 50, 2, out);
    expect(out).toEqual([1]);
    grid.querySpatialPoint(50, 50, 7, out);
    expect(out).toEqual([]);
  });
});

describe('querySpatialRay3D', () => {
  it('finds objects along each axis', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(100, 0, 0, 5));
    grid.insertSpatialObject(2, box(0, 100, 0, 5));
    grid.insertSpatialObject(3, box(0, 0, 100, 5));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(1, 1, 1, 1, 0, 0, out);
    expect(out).toEqual([1]);
    grid.querySpatialRay(1, 1, 1, 0, 1, 0, out);
    expect(out).toEqual([2]);
    grid.querySpatialRay(1, 1, 1, 0, 0, 1, out);
    expect(out).toEqual([3]);
  });

  it('walks a diagonal through the volume', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(1, box(10, 10, 10, 1));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(0, 0, 0, 1, 1, 1, out);
    expect(out).toEqual([1]);
  });

  it('drops a cell co-occupant the ray does not actually strike', () => {
    const grid = createUniformGridSpatialBackend3D(100);
    grid.insertSpatialObject(1, box(0, 0, 0, 1));
    grid.insertSpatialObject(2, box(0, 90, 90, 1));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(-10, 0.5, 0.5, 1, 0, 0, out);
    expect(out).toEqual([1]);
  });

  it('treats a zero direction as a point query', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(1, 1, 1, 0, 0, 0, out);
    expect(out).toEqual([1]);
  });

  it('ignores objects behind the origin', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(100, 2, 2, 1, 0, 0, out);
    expect(out).toEqual([]);
  });

  it('returns nothing from an empty grid', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(0, 0, 0, 1, 1, 1, out);
    expect(out).toEqual([]);
  });

  it('still terminates when only an overflowed object remains', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(1, box(0, 0, 0, 3));
    grid.insertSpatialObject(2, box(0, 0, 0, 40));
    grid.removeSpatialObject(1);
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(-1e6, 5, 5, 1, 0, 0, out);
    expect(out).toEqual([2]);
  });
});

describe('querySpatialRegion3D', () => {
  it('confirms cell-mates against the region bounds', () => {
    const grid = createUniformGridSpatialBackend3D(100);
    grid.insertSpatialObject(1, box(0, 0, 0, 1));
    grid.insertSpatialObject(2, box(50, 50, 50, 1));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRegion(box(0, 0, 0, 2), out);
    expect(out).toEqual([1]);
  });

  it('answers a region wider than the grid by scanning objects instead of cells', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(1, box(0, 0, 0, 0.5));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1e6, minY: -1e6, minZ: -1e6, maxX: 1e6, maxY: 1e6, maxZ: 1e6 }, out);
    expect(out).toEqual([1]);
  });

  it('excludes an object that only touches a face', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    const out: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: 5, minY: 0, minZ: 0, maxX: 9, maxY: 5, maxZ: 5 }, out);
    expect(out).toEqual([]);
  });
});

describe('updateSpatialObject3D', () => {
  it('refreshes bounds without retaining the caller object when the covered cells are unchanged', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(1, 1, 1, 3));
    const updated = box(2, 2, 2, 3);
    expect(grid.updateSpatialObject(1, updated)).toBe(true);
    updated.minX = -100;
    updated.maxZ = 100;

    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(-50, 2, 2, out);
    expect(out).toEqual([]);
    grid.querySpatialPoint(3, 3, 3, out);
    expect(out).toEqual([1]);
  });

  it('moves an object across cells', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    grid.updateSpatialObject(1, box(100, 100, 100, 5));
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(1, 1, 1, out);
    expect(out).toEqual([]);
    grid.querySpatialPoint(101, 101, 101, out);
    expect(out).toEqual([1]);
  });

  it('removes rather than strands an object whose new bounds are declined', () => {
    const grid = createUniformGridSpatialBackend3D(10);
    grid.insertSpatialObject(1, box(0, 0, 0, 5));
    expect(grid.updateSpatialObject(1, { minX: 0, minY: 0, minZ: NaN, maxX: 5, maxY: 5, maxZ: 5 })).toBe(false);
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(1, 1, 1, out);
    expect(out).toEqual([]);
  });

  it('transitions between celled and overflowed as the object resizes', () => {
    const grid = createUniformGridSpatialBackend3D(1);
    grid.insertSpatialObject(1, box(0, 0, 0, 2));
    expect(grid.explainSpatialIndexing(1).mode).toBe('cells');
    grid.updateSpatialObject(1, box(0, 0, 0, 40));
    expect(grid.explainSpatialIndexing(1).mode).toBe('overflow');
    grid.updateSpatialObject(1, box(0, 0, 0, 2));
    expect(grid.explainSpatialIndexing(1).mode).toBe('cells');

    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(1, 1, 1, out);
    expect(out).toEqual([1]);
  });
});
