import type { SpatialAabb3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainSpatialIndexing3D } from './explainSpatialIndexing3D';
import { createSpatialIndex3D, insertSpatialObject3D, removeSpatialObject3D } from './spatialIndex3D';
import { MAX_INDEXED_CELLS_PER_OBJECT } from './uniformGrid';
import { createUniformGridSpatialBackend3D } from './uniformGrid3D';

function box(minX: number, minY: number, minZ: number, size: number): SpatialAabb3D {
  return { minX, minY, minZ, maxX: minX + size, maxY: minY + size, maxZ: minZ + size };
}

describe('explainSpatialIndexing3D', () => {
  it('reports absent for an id that was never inserted', () => {
    const index = createSpatialIndex3D();
    expect(explainSpatialIndexing3D(index, 42)).toEqual({
      bucketCount: 0,
      id: 42,
      mode: 'absent',
      reason: null,
    });
  });

  it('reports absent after removal', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, box(0, 0, 0, 10));
    removeSpatialObject3D(index, 1);
    expect(explainSpatialIndexing3D(index, 1).mode).toBe('absent');
  });

  it('reports declined with the reason the bounds were refused', () => {
    const index = createSpatialIndex3D();
    insertSpatialObject3D(index, 1, { minX: 0, minY: 0, minZ: NaN, maxX: 1, maxY: 1, maxZ: 1 });
    insertSpatialObject3D(index, 2, { minX: 0, minY: 0, minZ: 9, maxX: 1, maxY: 1, maxZ: 0 });
    expect(explainSpatialIndexing3D(index, 1).reason).toBe('non-finite-bounds');
    expect(explainSpatialIndexing3D(index, 2).reason).toBe('inverted-bounds');
  });

  it('reports the cell count an ordinary object occupies', () => {
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(1));
    insertSpatialObject3D(index, 1, box(0, 0, 0, 1.5));
    // 0..1.5 spans cells 0 and 1 on each axis: a 2x2x2 block.
    expect(explainSpatialIndexing3D(index, 1)).toEqual({
      bucketCount: 8,
      id: 1,
      mode: 'cells',
      reason: null,
    });
  });

  it('pins the cost bound: an oversized object overflows rather than occupying unbounded buckets', () => {
    const index = createSpatialIndex3D(createUniformGridSpatialBackend3D(1));
    insertSpatialObject3D(index, 1, box(0, 0, 0, 5000));
    const explanation = explainSpatialIndexing3D(index, 1);
    expect(explanation.mode).toBe('overflow');
    expect(explanation.bucketCount).toBe(0);
    expect(explanation.bucketCount).toBeLessThanOrEqual(MAX_INDEXED_CELLS_PER_OBJECT);
  });
});
