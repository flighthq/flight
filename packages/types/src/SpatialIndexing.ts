import type { SpatialObjectId } from './Spatial';

// Plain-data answer to "how is this object held, and why is it not in my query results?" — the pull
// half of the diagnostics convention for `@flighthq/spatial`. Recomputed on demand by
// explainSpatialIndexing2D from the backend's live state, holding no reference to it. Format for humans
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

// Why an insert or update was declined. An oversized-but-valid AABB is still a real, indexable
// region and goes to overflow instead.
export type SpatialDeclineReason = 'inverted-bounds' | 'non-finite-bounds';

// The operation whose outcome produced an indexing notice.
export type SpatialIndexingOperation = 'insert' | 'remove' | 'update';

// Why the guard was notified. Decline reasons describe an object that could not be held;
// invalid-cell-size describes a grid that fell back to its bounded overflow path; missing-id reports
// update's documented insert fallback or remove's documented no-op.
export type SpatialIndexingReason = SpatialDeclineReason | 'invalid-cell-size' | 'missing-id';

// The push half: the record handed to a SpatialIndexingGuard for a noteworthy operation. Overflow is
// reported because it is almost always a signal that the grid's cell size is wrong for the workload
// — not because the result is wrong.
export interface SpatialIndexingNotice {
  readonly cellSize: number;
  readonly id: SpatialObjectId;
  readonly mode: SpatialIndexingMode;
  readonly operation: SpatialIndexingOperation;
  // The buckets the object *would* have occupied on the ordinary path. Meaningful for a size-budget
  // overflow, where it is the number the bound refused to walk; zero when no valid span exists.
  readonly wouldOccupyBucketCount: number;
  readonly reason: SpatialIndexingReason | null;
}

// Installed by setSpatialIndexingGuard and consulted at each noteworthy indexing site. Null
// uninstalls it and is the production default; caller-facing text lives in the separately-imported
// formatSpatialIndexingNotice companion, so not installing a guard costs only a null check.
export type SpatialIndexingGuard = (notice: Readonly<SpatialIndexingNotice>) => void;
