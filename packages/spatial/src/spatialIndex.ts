import { createEntity } from '@flighthq/entity/contract';
import type {
  SpatialAabb2D,
  SpatialIndex2D,
  SpatialIndexBackend2D,
  SpatialObjectId,
  SpatialPair,
} from '@flighthq/types/contract';

import { createUniformGridSpatialBackend2D } from './uniformGrid';

// Empties the index of all objects while keeping it (and its backend) reusable.
export function clearSpatialIndex2D(index: Readonly<SpatialIndex2D>): void {
  index.runtime.backend.clearSpatialIndex();
}

// Creates a 2D broadphase index. With no backend it defaults to a uniform grid sized for
// medium-scale scenes; pass an explicit backend (a differently-sized grid, or a future quadtree /
// sweep-and-prune) to select the structure for the workload. Constructing the default grid happens
// here, on call — importing the package has no side effect.
export function createSpatialIndex2D(backend?: SpatialIndexBackend2D): SpatialIndex2D {
  return createEntity({
    runtime: {
      backend: backend ?? createUniformGridSpatialBackend2D(DEFAULT_SPATIAL_CELL_SIZE),
    },
  });
}

// Adds an object to the index under `id` with its current bounds. The bounds are copied; the caller
// may reuse its own value afterward. Returns false when the bounds cannot be indexed at all
// (non-finite or inverted) — the object is then absent from every query rather than present at a
// nonsense position. Oversized-but-valid bounds return true and stay fully queryable; the backend
// decides how to hold them. explainSpatialIndexing2D reports which happened.
export function insertSpatialObject2D(
  index: Readonly<SpatialIndex2D>,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb2D>,
): boolean {
  return index.runtime.backend.insertSpatialObject(id, bounds);
}

// Fills `out` (cleared first) with every deduplicated candidate pair — each unordered pair at most
// once, never an object with itself. A pair is a broadphase candidate: the two objects are close
// enough to be worth a narrow-phase test, which the caller (or @flighthq/collision) performs.
export function querySpatialPairs2D(index: Readonly<SpatialIndex2D>, out: SpatialPair[]): void {
  index.runtime.backend.querySpatialPairs(out);
}

// Fills `out` (cleared first) with the ids whose bounds contain the point (`x`,`y`).
export function querySpatialPoint2D(
  index: Readonly<SpatialIndex2D>,
  x: number,
  y: number,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialPoint(x, y, out);
}

// Fills `out` (cleared first) with the ids whose bounds the ray from (`x`,`y`) along (`dx`,`dy`)
// intersects. The direction need not be normalized; the ray is treated as extending forward only.
export function querySpatialRay2D(
  index: Readonly<SpatialIndex2D>,
  x: number,
  y: number,
  dx: number,
  dy: number,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialRay(x, y, dx, dy, out);
}

// Fills `out` (cleared first) with the ids whose bounds overlap `region`.
export function querySpatialRegion2D(
  index: Readonly<SpatialIndex2D>,
  region: Readonly<SpatialAabb2D>,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialRegion(region, out);
}

// Removes an object from the index. A no-op if the id is not present.
export function removeSpatialObject2D(index: Readonly<SpatialIndex2D>, id: SpatialObjectId): void {
  index.runtime.backend.removeSpatialObject(id);
}

// Moves an already-inserted object to new bounds. Inserting a not-yet-present id behaves as insert.
// Returns the same sentinel as insertSpatialObject2D. A declined update removes the object rather than
// leaving it at its old bounds, so a caller that ignores the sentinel can never read a stale position
// as a current one.
export function updateSpatialObject2D(
  index: Readonly<SpatialIndex2D>,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb2D>,
): boolean {
  return index.runtime.backend.updateSpatialObject(id, bounds);
}

// The default uniform-grid cell size when createSpatialIndex2D is called without an explicit backend —
// a middle-of-the-road choice; a workload with a known typical object size should pass its own grid.
const DEFAULT_SPATIAL_CELL_SIZE = 128;
