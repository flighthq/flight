import { reviewableCells } from '../tools/review/src/cellRole';
import type { ReviewCellRole } from '../tools/review/src/cellRole';
import { filterReviewItems } from '../tools/review/src/reviewFilter';

interface Item {
  cells: { renderer: string; role: ReviewCellRole }[];
  name: string;
  tool: string;
}

const accessors = {
  name: (item: Item) => item.name,
  reviewableCellCount: (item: Item) => reviewableCells(item.cells).length,
  tool: (item: Item) => item.tool,
};

const manifestOrder: Item[] = [
  {
    cells: [
      { renderer: 'dom', role: 'reviewable' },
      { renderer: 'control', role: 'reference' },
    ],
    name: 'single-text',
    tool: 'functional',
  },
  {
    cells: [
      { renderer: 'canvas', role: 'reviewable' },
      { renderer: 'webgl', role: 'reviewable' },
    ],
    name: 'two-backends',
    tool: 'functional',
  },
  {
    cells: [
      { renderer: 'canvas', role: 'reviewable' },
      { renderer: 'webgl', role: 'reviewable' },
      { renderer: 'webgpu', role: 'reviewable' },
    ],
    name: 'three-backends',
    tool: 'examples',
  },
];

describe('review queue filtering', () => {
  it('keeps single-reviewable-cell scenes out of the queue by default, including under text search', () => {
    expect(
      filterReviewItems(manifestOrder, { includeSingleCellScenes: false, query: '' }, accessors).map(
        (item) => item.name,
      ),
    ).toEqual(['two-backends', 'three-backends']);
    expect(filterReviewItems(manifestOrder, { includeSingleCellScenes: false, query: 'single' }, accessors)).toEqual(
      [],
    );
  });

  it('includes single-cell scenes only after the reviewer explicitly opts in', () => {
    expect(
      filterReviewItems(manifestOrder, { includeSingleCellScenes: true, query: 'text' }, accessors).map(
        (item) => item.name,
      ),
    ).toEqual(['single-text']);
  });
});
