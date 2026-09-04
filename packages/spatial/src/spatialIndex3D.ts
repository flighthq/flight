import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  SpatialAabb3D,
  SpatialFrustum3D,
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
  const out = allocateEntity<SpatialIndex3D>();
  out.runtime = {
    backend: backend ?? createUniformGridSpatialBackend3D(DEFAULT_SPATIAL_CELL_SIZE_3D),
  };
  return finishEntity(out);
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

// Fills `out` (cleared first) with the ids whose bounds may lie inside the view volume — the candidate
// set for view culling.
//
// Built on the region query rather than on a new backend method, so every present and future backend
// answers it without implementing anything, and the ratified eight-method seam does not widen for a
// query that needs no structural knowledge.
//
// The volume is covered by `slices` axis-aligned boxes taken along its DEPTH rather than by one box
// around the whole thing. A single AABB is correct but nearly useless for culling: a long perspective
// frustum's bounding box approaches the whole world, so the query would hand back almost every object
// and cull nothing. Slicing costs one region query per slice and shrinks the covered volume toward the
// frustum itself — eight slices is a good default, and more is a straight trade of query time against
// candidates the caller would otherwise reject.
//
// The result is a CANDIDATE set, in the same sense as `querySpatialPairs3D`: every id whose bounds the
// covering boxes touch, which is a superset of what is truly visible. The caller applies the exact
// plane test to what comes back.
export function querySpatialFrustum3D(
  index: Readonly<SpatialIndex3D>,
  frustum: Readonly<SpatialFrustum3D>,
  out: SpatialObjectId[],
  slices = DEFAULT_FRUSTUM_SLICES,
): void {
  out.length = 0;
  const corners = frustum.corners;
  if (corners.length < 24 || !(slices >= 1)) return;

  const steps = Math.floor(slices);
  frustumSeen.clear();
  for (let slice = 0; slice < steps; slice += 1) {
    const nearT = slice / steps;
    const farT = (slice + 1) / steps;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    // Both ends of the slice, for all four edges: the volume between two depths is bounded by the eight
    // points at those depths. Taking only the far end would clip the slice's own near face away.
    for (let corner = 0; corner < 4; corner += 1) {
      const near = corner * 3;
      const far = 12 + corner * 3;
      for (const t of [nearT, farT]) {
        const x = corners[near] + (corners[far] - corners[near]) * t;
        const y = corners[near + 1] + (corners[far + 1] - corners[near + 1]) * t;
        const z = corners[near + 2] + (corners[far + 2] - corners[near + 2]) * t;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxZ)) return;

    queryRegionScratch.minX = minX;
    queryRegionScratch.minY = minY;
    queryRegionScratch.minZ = minZ;
    queryRegionScratch.maxX = maxX;
    queryRegionScratch.maxY = maxY;
    queryRegionScratch.maxZ = maxZ;
    index.runtime.backend.querySpatialRegion(queryRegionScratch, frustumSlice);

    // Slices share objects that straddle their boundary, so the union has to be deduplicated — without
    // this the same id appears once per slice it touches, and a caller counting results would over-count
    // a large object exactly in proportion to how large it is.
    for (const id of frustumSlice) {
      if (frustumSeen.has(id)) continue;
      frustumSeen.add(id);
      out.push(id);
    }
  }
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

// Fills `out` (cleared first) with the ids whose bounds may lie within `radius` of (`x`,`y`,`z`).
//
// A CANDIDATE set over the sphere's bounding cube, not an exact sphere test — the index stores bounds
// and answers box questions, and the corners of that cube reach past the sphere by a factor of the
// square root of three. That is the same contract every other query here keeps, and the caller that
// needs exactness applies the distance test to what comes back. The value of the export is that the
// cube is derived once, correctly, instead of at every callsite.
export function querySpatialSphere3D(
  index: Readonly<SpatialIndex3D>,
  x: number,
  y: number,
  z: number,
  radius: number,
  out: SpatialObjectId[],
): void {
  out.length = 0;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !(radius >= 0)) return;
  queryRegionScratch.minX = x - radius;
  queryRegionScratch.minY = y - radius;
  queryRegionScratch.minZ = z - radius;
  queryRegionScratch.maxX = x + radius;
  queryRegionScratch.maxY = y + radius;
  queryRegionScratch.maxZ = z + radius;
  index.runtime.backend.querySpatialRegion(queryRegionScratch, out);
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

// How many depth slices cover a frustum when the caller does not choose. Eight brings a typical
// perspective volume's covered bounds close to the volume itself while keeping the query to eight
// region calls; one slice degenerates to the single-AABB behaviour that makes frustum culling pointless.
const DEFAULT_FRUSTUM_SLICES = 8;

// Reused across calls: a culling pass runs every frame, and these would otherwise be three allocations
// per frame in the hot path. Never held beyond the call that fills them.
const queryRegionScratch: SpatialAabb3D = { maxX: 0, maxY: 0, maxZ: 0, minX: 0, minY: 0, minZ: 0 };
const frustumSeen = new Set<SpatialObjectId>();
const frustumSlice: SpatialObjectId[] = [];
