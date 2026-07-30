import type { SpatialObjectId } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainSpatialIndexing } from './explainSpatialIndexing';
import { createSpatialIndex, insertSpatialObject, removeSpatialObject, updateSpatialObject } from './spatialIndex';
import { MAX_INDEXED_CELLS_PER_OBJECT, createUniformGridSpatialBackend } from './uniformGrid';

describe('explainSpatialIndexing', () => {
  it('reports absent for an id that was never inserted', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(10));
    expect(explainSpatialIndexing(index, 42)).toEqual({ bucketCount: 0, id: 42, mode: 'absent', reason: null });
  });

  it('reports the bucket count of an ordinary object', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(10));
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 25, maxY: 25 });
    // Covers cells 0..2 on each axis.
    expect(explainSpatialIndexing(index, 1)).toEqual({ bucketCount: 9, id: 1, mode: 'cells', reason: null });
  });

  it('reports overflow with no buckets for an oversized object', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(1));
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 1e6, maxY: 1e6 });
    expect(explainSpatialIndexing(index, 1)).toEqual({ bucketCount: 0, id: 1, mode: 'overflow', reason: null });
  });

  it('reports declined with the reason for non-finite bounds', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(10));
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: Infinity, maxY: 10 });
    expect(explainSpatialIndexing(index, 1)).toEqual({
      bucketCount: 0,
      id: 1,
      mode: 'declined',
      reason: 'non-finite-bounds',
    });
  });

  it('returns to absent after a remove', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(10));
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 5, maxY: 5 });
    removeSpatialObject(index, 1);
    expect(explainSpatialIndexing(index, 1).mode).toBe('absent');
  });

  it('tracks the mode across updates', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(1));
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    expect(explainSpatialIndexing(index, 1).mode).toBe('cells');
    updateSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 1e9, maxY: 1e9 });
    expect(explainSpatialIndexing(index, 1).mode).toBe('overflow');
    updateSpatialObject(index, 1, { minX: NaN, minY: 0, maxX: 2, maxY: 2 });
    expect(explainSpatialIndexing(index, 1).mode).toBe('declined');
  });

  it('never exceeds the per-object bucket budget it exists to measure', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(1));
    const ids: SpatialObjectId[] = [];
    for (let i = 0; i < 8; i++) {
      const extent = 10 ** i;
      insertSpatialObject(index, i, { minX: 0, minY: 0, maxX: extent, maxY: extent });
      ids.push(i);
    }
    for (const id of ids) {
      expect(explainSpatialIndexing(index, id).bucketCount).toBeLessThanOrEqual(MAX_INDEXED_CELLS_PER_OBJECT);
    }
  });

  it('mutates nothing — repeated calls report the same thing', () => {
    const index = createSpatialIndex(createUniformGridSpatialBackend(10));
    insertSpatialObject(index, 1, { minX: 0, minY: 0, maxX: 5, maxY: 5 });
    const first = explainSpatialIndexing(index, 1);
    expect(explainSpatialIndexing(index, 1)).toEqual(first);
    expect(explainSpatialIndexing(index, 99).mode).toBe('absent');
    expect(explainSpatialIndexing(index, 1)).toEqual(first);
  });
});
