import type { SpatialIndexingGuard, SpatialIndexingNotice } from '@flighthq/types/contract';

// Hands a notice to the installed guard, or does nothing when none is installed. The null check is
// all production pays at a noteworthy site; the caller-facing text lives in the separately-importable
// formatSpatialIndexingNotice, per the diagnostics inversion rule.
//
// Shared by both dimensions' grids on purpose. The guard is a development diagnostic keyed to the
// question "why is this object not in my query results?", which is dimension-free — the notice's own
// vocabulary (mode, operation, reason, bucketCount) carries no axis. Giving 2D and 3D separate guards
// would mean an application debugging an index had to install two.
export function reportSpatialIndexing(notice: Readonly<SpatialIndexingNotice>): void {
  if (_indexingGuard === null) return;
  _indexingGuard(notice);
}

// Installs the indexing guard consulted for invalid configuration or bounds, missing-id operations,
// and overflow routing; null uninstalls it. Module-scoped rather than per-grid: it is a development
// diagnostic, and an application debugging an index wants it on for every grid at once — in either
// dimension.
export function setSpatialIndexingGuard(guard: SpatialIndexingGuard | null): void {
  _indexingGuard = guard;
}

// Diagnostics seam filled by setSpatialIndexingGuard.
let _indexingGuard: SpatialIndexingGuard | null = null;
