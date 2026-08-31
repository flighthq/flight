import {
  orderReviewItems,
  resolveReviewAttentionGroup,
  reviewItemByVisualDelta,
} from '../tools/review/src/reviewOrder';
import type { ReviewAttentionGroup, ReviewOrderAccessors } from '../tools/review/src/reviewOrder';

interface Item {
  tool: string;
  name: string;
  attention: ReviewAttentionGroup;
}

const accessors: ReviewOrderAccessors<Item> = {
  key: (item) => `${item.tool}/${item.name}`,
  tool: (item) => item.tool,
  name: (item) => item.name,
  attentionGroup: (item) => item.attention,
};

const manifestOrder: Item[] = [
  { tool: 'functional', name: 'alpha', attention: 'included' },
  { tool: 'functional', name: 'bravo', attention: 'differs' },
  { tool: 'functional', name: 'charlie', attention: 'requested' },
  { tool: 'functional', name: 'delta', attention: 'changed' },
  { tool: 'functional', name: 'echo', attention: 'not-commissioned' },
  { tool: 'examples', name: 'aardvark', attention: 'differs' },
];

describe('review visual order', () => {
  it('moves the keyboard through the same interleaved attention order rendered in the sidebar', () => {
    const rendered = orderReviewItems(manifestOrder, accessors);

    expect(rendered.map((item) => item.name)).toEqual(['bravo', 'delta', 'echo', 'charlie', 'alpha', 'aardvark']);
    expect.soft(reviewItemByVisualDelta(manifestOrder, 'functional/bravo', 1, accessors)?.name).toBe('delta');
    expect.soft(reviewItemByVisualDelta(manifestOrder, 'functional/charlie', -1, accessors)?.name).toBe('echo');
  });

  it('preserves visual ordering after filtering', () => {
    const filtered = manifestOrder.filter((item) => item.name.includes('a'));

    expect(orderReviewItems(filtered, accessors).map((item) => item.name)).toEqual([
      'bravo',
      'delta',
      'charlie',
      'alpha',
      'aardvark',
    ]);
  });
});

describe('resolveReviewAttentionGroup', () => {
  function cell(
    overrides: Partial<{
      commissionState: 'included' | 'differs' | 'not-commissioned' | 'requested' | null;
      changed: boolean | null;
      holdReason: string | null;
    }> = {},
  ) {
    return {
      commissionState: overrides.commissionState === undefined ? ('included' as const) : overrides.commissionState,
      changed: overrides.changed === undefined ? false : overrides.changed,
      holdReason: overrides.holdReason ?? null,
    };
  }

  // ★ THE CONFLATION THIS EXISTS TO END. commissionState is resolved without ever seeing the hold ledger,
  // so a held cell reported `differs` exactly like a cell nobody had decided about — while the gate
  // demotes the held one and passes. One pile, two opposite remedies.
  it('separates a scene whose every difference is held from one with an open difference', () => {
    expect(resolveReviewAttentionGroup([cell({ commissionState: 'differs' })])).toBe('differs');
    expect(resolveReviewAttentionGroup([cell({ commissionState: 'differs', holdReason: 'canvas is wrong' })])).toBe(
      'held',
    );
  });

  // Per-cell, not per-scene: one open failure is still an open failure however many siblings are settled.
  it('keeps a partly held scene in differs', () => {
    const group = resolveReviewAttentionGroup([
      cell({ commissionState: 'differs', holdReason: 'canvas is wrong' }),
      cell({ commissionState: 'differs' }),
    ]);

    expect(group).toBe('differs');
  });

  it('applies the same rule to an uncommissioned cell, which the gate also fails', () => {
    expect(resolveReviewAttentionGroup([cell({ commissionState: 'not-commissioned' })])).toBe('not-commissioned');
    expect(
      resolveReviewAttentionGroup([cell({ commissionState: 'not-commissioned', holdReason: 'no second host' })]),
    ).toBe('held');
  });

  it('does not promote a changed cell whose reference comparison already passes', () => {
    expect(resolveReviewAttentionGroup([cell({ changed: true })])).toBe('included');
    expect(resolveReviewAttentionGroup([cell({ changed: true, commissionState: 'not-commissioned' })])).toBe('changed');
  });

  it('does not let a held cell raise a scene into changed', () => {
    expect(resolveReviewAttentionGroup([cell({ changed: true, commissionState: 'not-commissioned' })])).toBe('changed');
    expect(
      resolveReviewAttentionGroup([
        cell({ changed: true, commissionState: 'not-commissioned', holdReason: 'known drift' }),
      ]),
    ).toBe('held');
  });

  it('leaves settled scenes where they were', () => {
    expect(resolveReviewAttentionGroup([cell({ commissionState: 'requested' })])).toBe('requested');
    expect(resolveReviewAttentionGroup([cell()])).toBe('included');
    expect(resolveReviewAttentionGroup([])).toBe('included');
  });
});
