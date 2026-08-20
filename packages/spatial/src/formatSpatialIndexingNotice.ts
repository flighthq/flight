import type { SpatialIndexingNotice } from '@flighthq/types/contract';

import { MAX_INDEXED_CELLS_PER_OBJECT } from './uniformGrid';

// Renders an indexing notice as a caller-facing sentence, and is the only place in this package that
// holds one. Import it to turn the structured record a SpatialIndexingGuard receives into something a
// developer reads; leave it unimported and neither the text nor its cost reaches a bundle.
//
// This package deliberately stops at the structured guard seam plus this optional formatter rather
// than adding an `enableSpatialGuards` that chooses reporting policy. A caller can send the record to
// tests, telemetry, a host sink, or `@flighthq/log`, choosing its own channel and deduplication. An
// application that installs no guard pays only the runtime's null checks and can leave this formatter
// unimported. Core guard modules may import the logger through the ratified narrow exception; spatial's
// caller-composed shape is a package choice, not a workaround for the layer rule. Wiring the two halves
// to the standard logger remains one line:
//
//   setSpatialIndexingGuard((notice) => logWarn({ message: formatSpatialIndexingNotice(notice) }, 'spatial'));
export function formatSpatialIndexingNotice(notice: Readonly<SpatialIndexingNotice>): string {
  if (notice.reason === 'invalid-cell-size') {
    return `createUniformGridSpatialBackend2D(${notice.cellSize}): cellSize must be a positive finite number. ${notice.operation}SpatialObject2D(${notice.id}) used the bounded overflow path instead, so results remain correct but queries scan this object.`;
  }
  if (notice.reason === 'inverted-bounds') {
    return `${notice.operation}SpatialObject2D(${notice.id}): minX/minY must not exceed maxX/maxY, so the object was not indexed and no query will return it. The operation returns false for this — normalize or correct the bounds upstream.`;
  }
  if (notice.reason === 'missing-id') {
    if (notice.operation === 'remove') {
      return `removeSpatialObject2D(${notice.id}): the id was not indexed, so removal was a no-op. Check the object's indexing lifecycle if this was unexpected.`;
    }
    return `updateSpatialObject2D(${notice.id}): the id was not indexed, so update used its documented insert behavior and left the object in '${notice.mode}' mode. Use insertSpatialObject2D for a new id, or check the object's indexing lifecycle.`;
  }
  if (notice.mode === 'declined') {
    return `${notice.operation}SpatialObject2D(${notice.id}): the bounds are not finite, so the object was not indexed and no query will return it. The operation returns false for this — check the sentinel, and check what produced NaN/Infinity bounds upstream.`;
  }
  if (notice.mode === 'overflow') {
    return `${notice.operation}SpatialObject2D(${notice.id}): the bounds span ${notice.wouldOccupyBucketCount} cells, over the ${MAX_INDEXED_CELLS_PER_OBJECT} per-object budget, so the object is held in the flat overflow list instead of the grid. Results are unaffected. If this is not a one-off outlier, the grid's cellSize is too small for the objects being indexed — size it to a typical object.`;
  }
  // `cells` and `absent` are ordinary outcomes no guard reports, so reaching here means a backend
  // notified about something this text does not cover. Say exactly that rather than inventing advice.
  return `${notice.operation}SpatialObject2D(${notice.id}): indexed as '${notice.mode}', which carries no caller-facing advice.`;
}
