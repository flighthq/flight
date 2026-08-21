import type { SpatialIndexingNotice, SpatialObjectId } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { reportSpatialIndexing, setSpatialIndexingGuard } from './spatialIndexingGuard';
import { createUniformGridSpatialBackend2D } from './uniformGrid';
import { createUniformGridSpatialBackend3D } from './uniformGrid3D';

afterEach(() => {
  setSpatialIndexingGuard(null);
});

describe('reportSpatialIndexing', () => {
  it('hands the notice to the installed guard unchanged', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const notice: SpatialIndexingNotice = {
      cellSize: 4,
      id: 3,
      mode: 'overflow',
      operation: 'insert',
      reason: 'invalid-cell-size',
      wouldOccupyBucketCount: 9,
    };
    reportSpatialIndexing(notice);
    expect(notices).toEqual([notice]);
  });

  it('is a no-op with no guard installed', () => {
    expect(() =>
      reportSpatialIndexing({
        cellSize: 1,
        id: 0,
        mode: 'absent',
        operation: 'remove',
        reason: 'missing-id',
        wouldOccupyBucketCount: 0,
      }),
    ).not.toThrow();
  });

  it('serves both dimensions from the one installed guard', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    createUniformGridSpatialBackend2D(10).insertSpatialObject(1, { minX: NaN, minY: 0, maxX: 1, maxY: 1 });
    createUniformGridSpatialBackend3D(10).insertSpatialObject(2, {
      minX: 0,
      minY: NaN,
      minZ: 0,
      maxX: 1,
      maxY: 1,
      maxZ: 1,
    });
    expect(notices.map((notice) => notice.id)).toEqual([1, 2]);
    expect(notices.every((notice) => notice.reason === 'non-finite-bounds')).toBe(true);
  });
});

describe('setSpatialIndexingGuard', () => {
  it('reports a decline with its reason, and no span', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(7, { minX: NaN, minY: 0, maxX: 10, maxY: 10 });
    expect(notices).toEqual([
      {
        cellSize: 10,
        id: 7,
        mode: 'declined',
        operation: 'insert',
        reason: 'non-finite-bounds',
        wouldOccupyBucketCount: 0,
      },
    ]);
  });

  it('reports an overflow with the span the bound refused to walk', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(7, { minX: 0, minY: 0, maxX: 199, maxY: 199 });
    expect(notices).toEqual([
      {
        cellSize: 1,
        id: 7,
        mode: 'overflow',
        operation: 'insert',
        reason: null,
        wouldOccupyBucketCount: 40000,
      },
    ]);
  });

  it('reports an invalid cell size and keeps results correct through the bounded overflow path', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    for (const cellSize of [0, -1]) {
      const grid = createUniformGridSpatialBackend2D(cellSize);
      expect(grid.insertSpatialObject(7, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true);
      const point: SpatialObjectId[] = [];
      grid.querySpatialPoint(5, 5, point);
      expect(point).toEqual([7]);
    }
    expect(notices).toEqual(
      [0, -1].map((cellSize) => ({
        cellSize,
        id: 7,
        mode: 'overflow',
        operation: 'insert',
        reason: 'invalid-cell-size',
        wouldOccupyBucketCount: 0,
      })),
    );
  });

  it('declines and reports inverted bounds', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend2D(10);
    expect(grid.insertSpatialObject(7, { minX: 10, minY: 0, maxX: 0, maxY: 10 })).toBe(false);
    expect(grid.explainSpatialIndexing(7)).toEqual({
      bucketCount: 0,
      id: 7,
      mode: 'declined',
      reason: 'inverted-bounds',
    });
    expect(notices).toEqual([
      {
        cellSize: 10,
        id: 7,
        mode: 'declined',
        operation: 'insert',
        reason: 'inverted-bounds',
        wouldOccupyBucketCount: 0,
      },
    ]);
  });

  it('reports update and remove operations whose id was never inserted', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend2D(10);
    expect(grid.updateSpatialObject(7, { minX: 0, minY: 0, maxX: 5, maxY: 5 })).toBe(true);
    grid.removeSpatialObject(8);
    expect(notices).toEqual([
      {
        cellSize: 10,
        id: 7,
        mode: 'cells',
        operation: 'update',
        reason: 'missing-id',
        wouldOccupyBucketCount: 0,
      },
      {
        cellSize: 10,
        id: 8,
        mode: 'absent',
        operation: 'remove',
        reason: 'missing-id',
        wouldOccupyBucketCount: 0,
      },
    ]);
  });

  it('stays silent on the ordinary path', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    grid.removeSpatialObject(1);
    expect(notices).toEqual([]);
  });

  it('null uninstalls it', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    setSpatialIndexingGuard(null);
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: NaN, minY: 0, maxX: 10, maxY: 10 });
    expect(notices).toEqual([]);
  });

  it('does not change what insert returns', () => {
    setSpatialIndexingGuard(() => {});
    const grid = createUniformGridSpatialBackend2D(10);
    expect(grid.insertSpatialObject(1, { minX: NaN, minY: 0, maxX: 10, maxY: 10 })).toBe(false);
    expect(grid.insertSpatialObject(2, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true);
  });
});
