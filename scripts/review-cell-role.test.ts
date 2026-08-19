import { describe, expect, it } from 'vitest';

import {
  nextReviewableCell,
  referenceCells,
  reviewableCells,
  reviewCellRole,
  selectedReviewableCell,
} from '../tools/review/src/cellRole';

interface Cell {
  renderer: string;
  role: 'reviewable' | 'reference';
}

const cells: Cell[] = [
  { renderer: 'dom', role: 'reviewable' },
  { renderer: 'control', role: 'reference' },
  { renderer: 'webgl', role: 'reviewable' },
];

describe('review cell roles', () => {
  it('treats the functional control target as context without changing other tools', () => {
    expect(reviewCellRole('functional', 'control')).toBe('reference');
    expect(reviewCellRole('functional', 'webgl')).toBe('reviewable');
    expect(reviewCellRole('examples', 'control')).toBe('reviewable');
  });

  it('partitions displayed cells without dropping the reference', () => {
    expect(reviewableCells(cells).map((cell) => cell.renderer)).toEqual(['dom', 'webgl']);
    expect(referenceCells(cells).map((cell) => cell.renderer)).toEqual(['control']);
  });

  it('never selects or stops on a reference cell', () => {
    expect(selectedReviewableCell(cells, 'control')?.renderer).toBe('dom');
    expect(nextReviewableCell(cells, 'dom', 1)?.renderer).toBe('webgl');
    expect(nextReviewableCell(cells, 'webgl', 1)?.renderer).toBe('dom');
    expect(nextReviewableCell(cells, 'dom', -1)?.renderer).toBe('webgl');
  });
});
