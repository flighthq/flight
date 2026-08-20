import type { SpatialIndexingNotice } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { formatSpatialIndexingNotice } from './formatSpatialIndexingNotice';
import {
  MAX_INDEXED_CELLS_PER_OBJECT,
  createUniformGridSpatialBackend2D,
  setSpatialIndexingGuard,
} from './uniformGrid';

afterEach(() => {
  setSpatialIndexingGuard(null);
});

describe('formatSpatialIndexingNotice', () => {
  it('names the sentinel to check for a decline', () => {
    const message = formatSpatialIndexingNotice({
      cellSize: 10,
      id: 3,
      mode: 'declined',
      operation: 'insert',
      reason: 'non-finite-bounds',
      wouldOccupyBucketCount: 0,
    });
    expect(message).toContain('insertSpatialObject2D(3)');
    expect(message).toContain('not finite');
    expect(message).toContain('returns false');
  });

  it('names the span and the cell-size cause for an overflow, without calling it wrong', () => {
    const message = formatSpatialIndexingNotice({
      cellSize: 1,
      id: 4,
      mode: 'overflow',
      operation: 'insert',
      reason: null,
      wouldOccupyBucketCount: 40000,
    });
    expect(message).toContain('insertSpatialObject2D(4)');
    expect(message).toContain('40000 cells');
    expect(message).toContain(`${MAX_INDEXED_CELLS_PER_OBJECT} per-object budget`);
    expect(message).toContain('cellSize is too small');
    // Overflow is a cost decision, not a wrong answer, and the message must not imply otherwise.
    expect(message).toContain('Results are unaffected');
  });

  it('explains invalid cell sizes, inverted bounds, and missing ids', () => {
    expect(
      formatSpatialIndexingNotice({
        cellSize: 0,
        id: 1,
        mode: 'overflow',
        operation: 'insert',
        reason: 'invalid-cell-size',
        wouldOccupyBucketCount: 0,
      }),
    ).toContain('cellSize must be a positive finite number');
    expect(
      formatSpatialIndexingNotice({
        cellSize: 10,
        id: 2,
        mode: 'declined',
        operation: 'update',
        reason: 'inverted-bounds',
        wouldOccupyBucketCount: 0,
      }),
    ).toContain('minX/minY must not exceed maxX/maxY');
    expect(
      formatSpatialIndexingNotice({
        cellSize: 10,
        id: 3,
        mode: 'absent',
        operation: 'remove',
        reason: 'missing-id',
        wouldOccupyBucketCount: 0,
      }),
    ).toContain('removal was a no-op');
  });

  it('says plainly that a mode it does not cover carries no advice', () => {
    expect(
      formatSpatialIndexingNotice({
        cellSize: 10,
        id: 5,
        mode: 'cells',
        operation: 'insert',
        reason: null,
        wouldOccupyBucketCount: 4,
      }),
    ).toContain('no caller-facing advice');
  });

  it('formats what the grid actually hands a guard', () => {
    // Pins the two halves together: a record produced by a real insert, rendered by this formatter.
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(9, { minX: 0, minY: 0, maxX: 199, maxY: 199 });
    grid.insertSpatialObject(10, { minX: NaN, minY: 0, maxX: 1, maxY: 1 });
    expect(notices.map(formatSpatialIndexingNotice)).toEqual([
      formatSpatialIndexingNotice({
        cellSize: 1,
        id: 9,
        mode: 'overflow',
        operation: 'insert',
        reason: null,
        wouldOccupyBucketCount: 40000,
      }),
      formatSpatialIndexingNotice({
        cellSize: 1,
        id: 10,
        mode: 'declined',
        operation: 'insert',
        reason: 'non-finite-bounds',
        wouldOccupyBucketCount: 0,
      }),
    ]);
    expect(notices.map(formatSpatialIndexingNotice)[0]).toContain('40000 cells');
  });
});
