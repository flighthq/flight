import type { SpatialIndexingNotice } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { formatSpatialIndexingNotice } from './formatSpatialIndexingNotice';
import { MAX_INDEXED_CELLS_PER_OBJECT, createUniformGridSpatialBackend, setSpatialIndexingGuard } from './uniformGrid';

afterEach(() => {
  setSpatialIndexingGuard(null);
});

describe('formatSpatialIndexingNotice', () => {
  it('names the sentinel to check for a decline', () => {
    const message = formatSpatialIndexingNotice({
      id: 3,
      mode: 'declined',
      reason: 'non-finite-bounds',
      wouldOccupyBucketCount: 0,
    });
    expect(message).toContain('insertSpatialObject(3)');
    expect(message).toContain('not finite');
    expect(message).toContain('returns false');
  });

  it('names the span and the cell-size cause for an overflow, without calling it wrong', () => {
    const message = formatSpatialIndexingNotice({
      id: 4,
      mode: 'overflow',
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

  it('says plainly that a mode it does not cover carries no advice', () => {
    expect(formatSpatialIndexingNotice({ id: 5, mode: 'cells', reason: null, wouldOccupyBucketCount: 4 })).toContain(
      'no caller-facing advice',
    );
  });

  it('formats what the grid actually hands a guard', () => {
    // Pins the two halves together: a record produced by a real insert, rendered by this formatter.
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const grid = createUniformGridSpatialBackend(1);
    grid.insertSpatialObject(9, { minX: 0, minY: 0, maxX: 199, maxY: 199 });
    grid.insertSpatialObject(10, { minX: NaN, minY: 0, maxX: 1, maxY: 1 });
    expect(notices.map(formatSpatialIndexingNotice)).toEqual([
      formatSpatialIndexingNotice({ id: 9, mode: 'overflow', reason: null, wouldOccupyBucketCount: 40000 }),
      formatSpatialIndexingNotice({ id: 10, mode: 'declined', reason: 'non-finite-bounds', wouldOccupyBucketCount: 0 }),
    ]);
    expect(notices.map(formatSpatialIndexingNotice)[0]).toContain('40000 cells');
  });
});
