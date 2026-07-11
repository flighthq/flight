import type { SpatialAabb, SpatialIndex, SpatialIndexBackend, SpatialObjectId, SpatialPair } from '@flighthq/types';

import { createUniformGridSpatialBackend } from './uniformGrid';

// Empties the index of all objects while keeping it (and its backend) reusable.
export function clearSpatialIndex(index: Readonly<SpatialIndex>): void {
  index.runtime.backend.clearSpatialIndex();
}

// Creates a 2D broadphase index. With no backend it defaults to a uniform grid sized for
// medium-scale scenes; pass an explicit backend (a differently-sized grid, or a future quadtree /
// sweep-and-prune) to select the structure for the workload. Constructing the default grid happens
// here, on call — importing the package has no side effect.
export function createSpatialIndex(backend?: SpatialIndexBackend): SpatialIndex {
  return {
    runtime: {
      backend: backend ?? createUniformGridSpatialBackend(DEFAULT_SPATIAL_CELL_SIZE),
    },
  };
}

// Adds an object to the index under `id` with its current bounds. The bounds are copied; the caller
// may reuse its own value afterward.
export function insertSpatialObject(
  index: Readonly<SpatialIndex>,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb>,
): void {
  index.runtime.backend.insertSpatialObject(id, bounds);
}

// Fills `out` (cleared first) with every deduplicated candidate pair — each unordered pair at most
// once, never an object with itself. A pair is a broadphase candidate: the two objects are close
// enough to be worth a narrow-phase test, which the caller (or @flighthq/collision) performs.
export function querySpatialPairs(index: Readonly<SpatialIndex>, out: SpatialPair[]): void {
  index.runtime.backend.querySpatialPairs(out);
}

// Fills `out` (cleared first) with the ids whose bounds contain the point (`x`,`y`).
export function querySpatialPoint(index: Readonly<SpatialIndex>, x: number, y: number, out: SpatialObjectId[]): void {
  index.runtime.backend.querySpatialPoint(x, y, out);
}

// Fills `out` (cleared first) with the ids whose bounds the ray from (`x`,`y`) along (`dx`,`dy`)
// intersects. The direction need not be normalized; the ray is treated as extending forward only.
export function querySpatialRay(
  index: Readonly<SpatialIndex>,
  x: number,
  y: number,
  dx: number,
  dy: number,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialRay(x, y, dx, dy, out);
}

// Fills `out` (cleared first) with the ids whose bounds overlap `region`.
export function querySpatialRegion(
  index: Readonly<SpatialIndex>,
  region: Readonly<SpatialAabb>,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialRegion(region, out);
}

// Removes an object from the index. A no-op if the id is not present.
export function removeSpatialObject(index: Readonly<SpatialIndex>, id: SpatialObjectId): void {
  index.runtime.backend.removeSpatialObject(id);
}

// Moves an already-inserted object to new bounds. Inserting a not-yet-present id behaves as insert.
export function updateSpatialObject(
  index: Readonly<SpatialIndex>,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb>,
): void {
  index.runtime.backend.updateSpatialObject(id, bounds);
}

// The default uniform-grid cell size when createSpatialIndex is called without an explicit backend —
// a middle-of-the-road choice; a workload with a known typical object size should pass its own grid.
const DEFAULT_SPATIAL_CELL_SIZE = 128;
