import type { SpatialIndex2D, SpatialIndexingExplanation, SpatialObjectId } from '@flighthq/types/contract';

// Reports how the index is currently holding `id`, as plain data. Pure: reads only, indexes nothing,
// never throws on an unknown id, and retains no reference to the backend. Import it to answer "why is
// this object not in my query results?" — `absent` means it was never inserted or was removed,
// `declined` means its bounds were non-finite or inverted and it is deliberately not held, `overflow`
// means it is held but cannot be usefully bucketed, and `cells` reports the bucket count the
// per-object bound caps.
//
// This is the pull half of the diagnostics convention, and the measurement seam a regression test
// asserts the cost bound against: `bucketCount` is the number that goes unbounded when the bound is
// removed, so a test can pin it without timing anything.
export function explainSpatialIndexing2D(
  index: Readonly<SpatialIndex2D>,
  id: SpatialObjectId,
): SpatialIndexingExplanation {
  return index.runtime.backend.explainSpatialIndexing(id);
}
