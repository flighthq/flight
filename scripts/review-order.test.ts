import { orderReviewItems, reviewItemByVisualDelta } from '../tools/review/src/reviewOrder';
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
