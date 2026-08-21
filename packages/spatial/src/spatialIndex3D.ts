import type {
  SpatialAabb3D,
  SpatialIndex3D,
  SpatialIndexBackend3D,
  SpatialObjectId,
  SpatialPair,
} from '@flighthq/types/contract';

import { createUniformGridSpatialBackend3D } from './uniformGrid3D';

// Empties the index of all objects while keeping it (and its backend) reusable.
export function clearSpatialIndex3D(index: Readonly<SpatialIndex3D>): void {
  index.runtime.backend.clearSpatialIndex();
}

// Creates a 3D broadphase index. With no backend it defaults to a uniform grid sized for
// medium-scale scenes; pass an explicit backend (a differently-sized grid, or a future octree / BVH)
// to select the structure for the workload. Constructing the default grid happens here, on call —
// importing the package has no side effect.
export function createSpatialIndex3D(backend?: SpatialIndexBackend3D): SpatialIndex3D {
  return {
    runtime: {
      backend: backend ?? createUniformGridSpatialBackend3D(DEFAULT_SPATIAL_CELL_SIZE_3D),
    },
  };
}

// Adds an object to the index under `id` with its current bounds. The bounds are copied; the caller
// may reuse its own value afterward. Returns false when the bounds cannot be indexed at all
// (non-finite or inverted) — the object is then absent from every query rather than present at a
// nonsense position. Oversized-but-valid bounds return true and stay fully queryable; the backend
// decides how to hold them. explainSpatialIndexing3D reports which happened.
export function insertSpatialObject3D(
  index: Readonly<SpatialIndex3D>,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb3D>,
): boolean {
  return index.runtime.backend.insertSpatialObject(id, bounds);
}

// Fills `out` (cleared first) with every deduplicated candidate pair — each unordered pair at most
// once, never an object with itself. A pair is a broadphase candidate: the two objects are close
// enough to be worth a narrow-phase test, which the caller (or @flighthq/collision) performs.
export function querySpatialPairs3D(index: Readonly<SpatialIndex3D>, out: SpatialPair[]): void {
  index.runtime.backend.querySpatialPairs(out);
}

// Fills `out` (cleared first) with the ids whose bounds contain the point (`x`,`y`,`z`).
export function querySpatialPoint3D(
  index: Readonly<SpatialIndex3D>,
  x: number,
  y: number,
  z: number,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialPoint(x, y, z, out);
}

// Fills `out` (cleared first) with the ids whose bounds the ray from (`x`,`y`,`z`) along
// (`dx`,`dy`,`dz`) intersects. The direction need not be normalized; the ray is treated as extending
// forward only.
export function querySpatialRay3D(
  index: Readonly<SpatialIndex3D>,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialRay(x, y, z, dx, dy, dz, out);
}

// Fills `out` (cleared first) with the ids whose bounds overlap `region`.
export function querySpatialRegion3D(
  index: Readonly<SpatialIndex3D>,
  region: Readonly<SpatialAabb3D>,
  out: SpatialObjectId[],
): void {
  index.runtime.backend.querySpatialRegion(region, out);
}

// Removes an object from the index. A no-op if the id is not present.
export function removeSpatialObject3D(index: Readonly<SpatialIndex3D>, id: SpatialObjectId): void {
  index.runtime.backend.removeSpatialObject(id);
}

// Moves an already-inserted object to new bounds. Inserting a not-yet-present id behaves as insert.
// Returns the same sentinel as insertSpatialObject3D. A declined update removes the object rather than
// leaving it at its old bounds, so a caller that ignores the sentinel can never read a stale position
// as a current one.
export function updateSpatialObject3D(
  index: Readonly<SpatialIndex3D>,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb3D>,
): boolean {
  return index.runtime.backend.updateSpatialObject(id, bounds);
}

// The default uniform-grid cell size when createSpatialIndex3D is called without an explicit backend.
// Deliberately the same middle-of-the-road number as the 2D default: a cell is a world-space length,
// not a volume, so "roughly the size of a typical object" means the same thing in both dimensions. A
// workload with a known typical object size should pass its own grid — and in 3D it pays off sooner,
// since the per-object cell budget is a ~10-cell cube rather than a 32-cell square.
const DEFAULT_SPATIAL_CELL_SIZE_3D = 128;
