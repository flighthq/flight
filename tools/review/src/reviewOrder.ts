export type ReviewAttentionGroup = 'differs' | 'changed' | 'not-commissioned' | 'requested' | 'included';

export const REVIEW_ATTENTION_GROUP_ORDER: readonly ReviewAttentionGroup[] = [
  'differs',
  'changed',
  'not-commissioned',
  'requested',
  'included',
];

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
