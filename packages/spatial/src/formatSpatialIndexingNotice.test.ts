import type { SpatialIndexingNotice } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { formatSpatialIndexingNotice } from './formatSpatialIndexingNotice';
import { setSpatialIndexingGuard } from './spatialIndexingGuard';
import { MAX_INDEXED_CELLS_PER_OBJECT, createUniformGridSpatialBackend2D } from './uniformGrid';

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
    expect(message).toContain('insertSpatialObject(3)');
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
    expect(message).toContain('insertSpatialObject(4)');
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
    ).toContain("the uniform grid's cellSize (0) must be a positive finite number");
    expect(
      formatSpatialIndexingNotice({
        cellSize: 10,
        id: 2,
        mode: 'declined',
        operation: 'update',
        reason: 'inverted-bounds',
        wouldOccupyBucketCount: 0,
      }),
    ).toContain('no minimum may exceed its matching maximum');
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

  it('names no dimension, because a notice carries none to name', () => {
    // One guard serves both dimensions, so nothing in a notice says which one produced it. A sentence
    // naming `removeSpatialObject2D` was therefore misdescribing every 3D notice, and the unsuffixed
    // backend method is the name that is true for both — and the one a caller greps.
    const modes = ['cells', 'overflow', 'declined', 'absent'] as const;
    const operations = ['insert', 'update', 'remove'] as const;
    const reasons = [null, 'invalid-cell-size', 'inverted-bounds', 'missing-id', 'non-finite-bounds'] as const;
    for (const mode of modes) {
      for (const operation of operations) {
        for (const reason of reasons) {
          const message = formatSpatialIndexingNotice({
            cellSize: 1,
            id: 7,
            mode,
            operation,
            reason,
            wouldOccupyBucketCount: 2,
          });
          expect(message).not.toContain('2D');
          expect(message).not.toContain('3D');
        }
      }
    }
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
