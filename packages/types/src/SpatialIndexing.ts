import type { SpatialObjectId } from './Spatial';

// Plain-data answer to "how is this object held, and why is it not in my query results?" — the pull
// half of the diagnostics convention for `@flighthq/spatial`. Recomputed on demand by
// explainSpatialIndexing from the backend's live state, holding no reference to it. Format for humans
// in a separate format* companion, never here.
export interface SpatialIndexingExplanation {
  readonly id: SpatialObjectId;
  readonly mode: SpatialIndexingMode;
  // How many index buckets this object occupies — the cost measure the oversized-extent bound exists
  // to cap, and the number a regression test asserts against. Zero for every mode but `cells`, and
  // zero for a structure that has no buckets to report.
  readonly bucketCount: number;
  // Why the object was declined, or null when it was indexed. Non-null exactly when mode is
  // `declined`.
  readonly reason: SpatialDeclineReason | null;
}

// `absent` — the id was never inserted, or was removed.
// `cells` — held in the buckets its bounds cover, the ordinary path.
// `overflow` — held in the flat oversized list: its bounds span more buckets than the per-object
//   budget, so bucketing it would cost more than scanning it. Fully queryable; this is a cost
//   decision, not a degraded result.
// `declined` — not held at all, because the bounds could not be indexed. No query returns it.
export type SpatialIndexingMode = 'absent' | 'cells' | 'declined' | 'overflow';

// Why an insert or update was declined. Only non-finite bounds decline: an oversized-but-finite AABB
// is still a real, indexable region and goes to overflow instead.
export type SpatialDeclineReason = 'non-finite-bounds';

// The push half: the record handed to a SpatialDeclineGuard when an object is declined outright, or
// routed to overflow. Overflow is reported because it is almost always a signal that the grid's cell
// size is wrong for the workload — not because the result is wrong.
export interface SpatialIndexingNotice {
  readonly id: SpatialObjectId;
  readonly mode: SpatialIndexingMode;
  // The buckets the object *would* have occupied on the ordinary path. Meaningful for `overflow`,
  // where it is the number the bound refused to walk; zero for `declined`, where no span exists.
  readonly wouldOccupyBucketCount: number;
  readonly reason: SpatialDeclineReason | null;
}

// Installed by enableSpatialGuards and consulted at each decline/overflow site. Null uninstalls it,
// and null is the production default — the message text and the @flighthq/log dependency live only in
// the separately-imported guard module, so not enabling guards costs a null check.
export type SpatialIndexingGuard = (notice: Readonly<SpatialIndexingNotice>) => void;
