export type ReviewCellRole = 'reviewable' | 'reference';

export interface ReviewCellWithRole {
  renderer: string;
  role: ReviewCellRole;
}

/**
 * Maps captured identities onto the review contract. `control` is a functional target rather than a
 * backend: it is visible context whose authored pixels are never themselves a review decision.
 * Keeping this in one shared function lets both the manifest and the mutation endpoints enforce the
 * same boundary.
 */
export function reviewCellRole(tool: string, renderer: string): ReviewCellRole {
  return tool === 'functional' && renderer === 'control' ? 'reference' : 'reviewable';
}

export function isReviewableCell<T extends ReviewCellWithRole>(cell: T): cell is T & { role: 'reviewable' } {
  return cell.role === 'reviewable';
}

export function isReferenceCell<T extends ReviewCellWithRole>(cell: T): cell is T & { role: 'reference' } {
  return cell.role === 'reference';
}

export function reviewableCells<T extends ReviewCellWithRole>(cells: readonly T[]): T[] {
  return cells.filter(isReviewableCell);
}

export function referenceCells<T extends ReviewCellWithRole>(cells: readonly T[]): T[] {
  return cells.filter(isReferenceCell);
}

export function selectedReviewableCell<T extends ReviewCellWithRole>(cells: readonly T[], renderer: string): T | null {
  const reviewable = reviewableCells(cells);
  return reviewable.find((cell) => cell.renderer === renderer) ?? reviewable[0] ?? null;
}

export function nextReviewableCell<T extends ReviewCellWithRole>(
  cells: readonly T[],
  renderer: string,
  delta: -1 | 1,
): T | null {
  const reviewable = reviewableCells(cells);
  if (reviewable.length === 0) return null;
  const selected = selectedReviewableCell(reviewable, renderer);
  const index = selected === null ? 0 : reviewable.indexOf(selected);
  return reviewable[(index + delta + reviewable.length) % reviewable.length] ?? null;
}
