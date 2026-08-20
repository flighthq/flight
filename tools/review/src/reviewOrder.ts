export type ReviewAttentionGroup = 'differs' | 'changed' | 'not-commissioned' | 'held' | 'requested' | 'included';

export const REVIEW_ATTENTION_GROUP_ORDER: readonly ReviewAttentionGroup[] = [
  'differs',
  'changed',
  'not-commissioned',
  'held',
  'requested',
  'included',
];

export interface ReviewAttentionCell {
  commissionState: 'included' | 'differs' | 'not-commissioned' | 'requested' | null;
  changed: boolean | null;
  holdReason: string | null;
}

/**
 * The group a scene belongs to, which is the tool's answer to "will the gate fail on this".
 *
 * ★ A HOLD AND AN OPEN FAILURE LOOKED IDENTICAL HERE, AND THEY HAVE OPPOSITE REMEDIES. `commissionState`
 * is resolved without ever being shown the hold ledger, so a held cell reports `differs` exactly like a
 * cell nobody has decided about — while `joinOracleState` demotes the held one to a `held` verdict and
 * passes the run. The reviewer was handed one pile containing "go fix this" and "already decided, left
 * deliberately red-looking", with nothing to tell them apart.
 *
 * The rule is per-cell, not per-scene: a scene stays in `differs` while ANY differing cell is unheld,
 * because one open failure is still an open failure however many of its siblings are settled. Only when
 * every differing cell is held does the scene become `held`.
 */
export function resolveReviewAttentionGroup(cells: readonly ReviewAttentionCell[]): ReviewAttentionGroup {
  const differing = cells.filter((cell) => cell.commissionState === 'differs');
  const openDiffering = differing.filter((cell) => cell.holdReason === null);
  if (openDiffering.length > 0) return 'differs';
  if (cells.some((cell) => cell.changed === true && cell.holdReason === null)) return 'changed';
  const uncommissioned = cells.filter((cell) => cell.commissionState === 'not-commissioned');
  if (uncommissioned.some((cell) => cell.holdReason === null)) return 'not-commissioned';
  // Everything that would have drawn attention is held. Reported rather than hidden: the user's rule is
  // that a hold stays visible precisely so it can be revisited, it just stops being a failure.
  if (differing.length > 0 || uncommissioned.length > 0 || cells.some((cell) => cell.holdReason !== null)) {
    return 'held';
  }
  if (cells.some((cell) => cell.commissionState === 'requested')) return 'requested';
  return 'included';
}

export interface ReviewOrderAccessors<T> {
  key(item: T): string;
  tool(item: T): string;
  name(item: T): string;
  attentionGroup(item: T): ReviewAttentionGroup;
}

export function orderReviewItems<T>(items: readonly T[], accessors: ReviewOrderAccessors<T>): T[] {
  const ordered: T[] = [];
  const tools = [...new Set(items.map((item) => accessors.tool(item)))];
  for (const tool of tools) {
    const toolItems = items.filter((item) => accessors.tool(item) === tool);
    for (const group of REVIEW_ATTENTION_GROUP_ORDER) {
      ordered.push(
        ...toolItems
          .filter((item) => accessors.attentionGroup(item) === group)
          .sort((a, b) => accessors.name(a).localeCompare(accessors.name(b))),
      );
    }
  }
  return ordered;
}

export function reviewItemByVisualDelta<T>(
  items: readonly T[],
  selectedKey: string,
  delta: -1 | 1,
  accessors: ReviewOrderAccessors<T>,
): T | undefined {
  const ordered = orderReviewItems(items, accessors);
  const index = ordered.findIndex((item) => accessors.key(item) === selectedKey);
  return ordered[index + delta];
}
