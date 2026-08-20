export interface ReviewFilterAccessors<T> {
  name: (item: T) => string;
  reviewableCellCount: (item: T) => number;
  tool: (item: T) => string;
}

export interface ReviewFilterOptions {
  includeSingleCellScenes: boolean;
  query: string;
}

/** Applies the queue-scope rule before text filtering, preserving manifest order for later visual sorting. */
export function filterReviewItems<T>(
  items: readonly T[],
  options: Readonly<ReviewFilterOptions>,
  accessors: Readonly<ReviewFilterAccessors<T>>,
): T[] {
  const query = options.query.toLowerCase().trim();
  return items.filter((item) => {
    if (!options.includeSingleCellScenes && accessors.reviewableCellCount(item) < 2) return false;
    return (
      query.length === 0 ||
      accessors.name(item).toLowerCase().includes(query) ||
      accessors.tool(item).toLowerCase().includes(query)
    );
  });
}
