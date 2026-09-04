import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  SpatialAabb3D,
  SpatialDeclineReason,
  SpatialIndexBackend3D,
  SpatialIndexingExplanation,
  SpatialIndexingMode,
  SpatialIndexingOperation,
  SpatialIndexingReason,
  SpatialObjectId,
  SpatialPair,
} from '@flighthq/types/contract';

import { reportSpatialIndexing } from './spatialIndexingGuard';
import { MAX_INDEXED_CELLS_PER_OBJECT } from './uniformGrid';

// Builds a 3D uniform-grid (spatial-hash) backend: an object's AABB is mapped to the rectangular
// block of fixed-size cells it covers, and each cell holds the ids overlapping it. Co-located objects
// share a cell, so candidate pairs and region/point/ray hits are found by looking only at the relevant
// cells instead of scanning every object. `cellSize` is the world-space side length of one cell; a
// good value is roughly the size of a typical object. No import-time side effect — the caller
// constructs a grid explicitly, and createSpatialIndex3D uses this as its default index.
//
// The cost policy is the 2D grid's, unchanged and deliberately so, but the per-object cell budget
// BINDS HARDER HERE and that is worth stating plainly: MAX_INDEXED_CELLS_PER_OBJECT is a 32x32 block
// in two dimensions and only a ~10x10x10 block in three. An object more than about ten cells wide on
// a side overflows, where its 2D counterpart would have had to be thirty-two. That is the bound doing
// its job rather than a mis-set constant — the walk it prevents grows as extent divided by cellSize
// CUBED, so the runaway it exists to stop arrives sooner and steeper. A workload whose objects
// overflow is telling the caller its cell size is wrong, which the indexing guard reports.
export function createUniformGridSpatialBackend3D(cellSize: number): SpatialIndexBackend3D & Entity {
  const grid: UniformGrid3D = {
    cellSize,
    cells: new Map(),
    bounds: new Map(),
    overflow: new Set(),
    declined: new Map(),
    minCellX: 0,
    minCellY: 0,
    minCellZ: 0,
    maxCellX: 0,
    maxCellY: 0,
    maxCellZ: 0,
    seen: new Set(),
    pairIds: [],
  };
  const out = allocateEntity<SpatialIndexBackend3D>();
  out.insertSpatialObject = (id, bounds) => {
    return _insertIntoGrid3D(grid, id, bounds, 'insert');
  };
  out.updateSpatialObject = (id, bounds) => {
    return _updateGrid3DObject(grid, id, bounds);
  };
  out.removeSpatialObject = (id) => {
    const wasMissing = !grid.bounds.has(id) && !grid.declined.has(id);
    _removeFromGrid3D(grid, id);
    if (wasMissing) _reportGrid3DIndexing(grid, id, 'absent', 'remove', 'missing-id', 0);
  };
  out.clearSpatialIndex = () => {
    grid.cells.clear();
    grid.bounds.clear();
    grid.overflow.clear();
    grid.declined.clear();
    grid.seen.clear();
    grid.pairIds.length = 0;
  };
  out.explainSpatialIndexing = (id) => {
    return _explainGrid3DIndexing(grid, id);
  };
  out.querySpatialPairs = (out) => {
    _queryGrid3DPairs(grid, out);
  };
  out.querySpatialRegion = (region, out) => {
    _queryGrid3DRegion(grid, region, out);
  };
  out.querySpatialPoint = (x, y, z, out) => {
    _queryGrid3DPoint(grid, x, y, z, out);
  };
  out.querySpatialRay = (x, y, z, dx, dy, dz, out) => {
    _queryGrid3DRay(grid, x, y, z, dx, dy, dz, out);
  };
  return finishEntity(out);
}

// One occupied cell: its integer cell coordinates and the ids whose bounds cover it. The coordinates
// are stored (not just parsed back from the map key) so pair dedup can test the current cell against
// a pair's canonical cell without string work.
interface GridCell3D {
  cx: number;
  cy: number;
  cz: number;
  ids: Set<SpatialObjectId>;
}

// Internal state of one 3D uniform grid. `bounds` keeps each object's stored (copied) AABB so update
// and remove can find the cells it previously covered, and so region/point/ray results can be
// confirmed against the real bounds — it holds every indexed object, whether celled or overflowed, and
// is what every query falls back to scanning. `overflow` holds the ids too large to bucket, `declined`
// the ids whose bounds could not be indexed at all (those have no `bounds` entry, so no query can
// reach them). `pairIds` is the reused cell-enumeration scratch array and `seen` is the reused gather
// set; both are cleared per query, never reallocated. `minCell*`/`maxCell*` track the occupied cell
// range for ray traversal; they only ever expand while celled objects exist (remove does not shrink
// them — a conservative over-walk) and reset when the grid empties.
interface UniformGrid3D {
  cellSize: number;
  cells: Map<string, GridCell3D>;
  bounds: Map<SpatialObjectId, SpatialAabb3D>;
  overflow: Set<SpatialObjectId>;
  declined: Map<SpatialObjectId, SpatialDeclineReason>;
  minCellX: number;
  minCellY: number;
  minCellZ: number;
  maxCellX: number;
  maxCellY: number;
  maxCellZ: number;
  seen: Set<SpatialObjectId>;
  pairIds: SpatialObjectId[];
}

// Maps a world coordinate to its cell index along one axis. Uses floor so negative coordinates map
// to consistently decreasing cell indices (world 0 is the boundary between cell -1 and cell 0).
function _cellIndex3D(coord: number, cellSize: number): number {
  return Math.floor(coord / cellSize);
}

// The map key for a cell. A string of the three signed integer coordinates — negatives and large
// magnitudes are represented exactly, unlike a numeric pairing that could overflow or collide.
function _cellKey3D(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

// Reports how `id` is currently held. Pure: reads only, allocates only the returned record.
function _explainGrid3DIndexing(grid: UniformGrid3D, id: SpatialObjectId): SpatialIndexingExplanation {
  const declineReason = grid.declined.get(id);
  if (declineReason !== undefined) return { bucketCount: 0, id, mode: 'declined', reason: declineReason };
  if (grid.overflow.has(id)) return { bucketCount: 0, id, mode: 'overflow', reason: null };
  const bounds = grid.bounds.get(id);
  if (bounds === undefined) return { bucketCount: 0, id, mode: 'absent', reason: null };
  return { bucketCount: _spannedCellCount3D(grid.cellSize, bounds), id, mode: 'cells', reason: null };
}

// Adds an object to the index, storing a private copy of the bounds; the caller may safely mutate or
// reuse the passed bounds afterward. Returns false only for bounds that cannot be indexed at all.
//
// Five outcomes, and which one applies is decided *before* any cell is touched — that ordering is the
// whole point, since deciding afterward would mean walking the cells to find out they were too many,
// and in three dimensions that walk is cubic in the object's extent.
function _insertIntoGrid3D(
  grid: UniformGrid3D,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb3D>,
  operation: SpatialIndexingOperation,
): boolean {
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY) ||
    !Number.isFinite(bounds.maxZ)
  ) {
    grid.declined.set(id, 'non-finite-bounds');
    _reportGrid3DIndexing(grid, id, 'declined', operation, 'non-finite-bounds', 0);
    return false;
  }
  if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY || bounds.maxZ < bounds.minZ) {
    grid.declined.set(id, 'inverted-bounds');
    _reportGrid3DIndexing(grid, id, 'declined', operation, 'inverted-bounds', 0);
    return false;
  }

  const cs = grid.cellSize;
  const copy = {
    minX: bounds.minX,
    minY: bounds.minY,
    minZ: bounds.minZ,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    maxZ: bounds.maxZ,
  };
  if (!(cs > 0 && Number.isFinite(cs))) {
    grid.bounds.set(id, copy);
    grid.overflow.add(id);
    _reportGrid3DIndexing(grid, id, 'overflow', operation, 'invalid-cell-size', 0);
    return true;
  }
  const spanned = _spannedCellCount3D(cs, copy);
  // Written as a negated `<=` so an unrepresentable span falls to overflow rather than through to a
  // loop that cannot index it.
  if (!(spanned <= MAX_INDEXED_CELLS_PER_OBJECT)) {
    grid.bounds.set(id, copy);
    grid.overflow.add(id);
    _reportGrid3DIndexing(grid, id, 'overflow', operation, null, spanned);
    return true;
  }

  const cx0 = _cellIndex3D(copy.minX, cs);
  const cx1 = _cellIndex3D(copy.maxX, cs);
  const cy0 = _cellIndex3D(copy.minY, cs);
  const cy1 = _cellIndex3D(copy.maxY, cs);
  const cz0 = _cellIndex3D(copy.minZ, cs);
  const cz1 = _cellIndex3D(copy.maxZ, cs);
  // Whether a cell range exists yet, read *before* this object's cells are added. A first celled
  // object seeds the range; a later one widens it.
  const hadCells = grid.cells.size !== 0;
  grid.bounds.set(id, copy);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = _cellKey3D(cx, cy, cz);
        let cell = grid.cells.get(key);
        if (cell === undefined) {
          cell = { cx, cy, cz, ids: new Set() };
          grid.cells.set(key, cell);
        }
        cell.ids.add(id);
      }
    }
  }
  if (!hadCells) {
    grid.minCellX = cx0;
    grid.maxCellX = cx1;
    grid.minCellY = cy0;
    grid.maxCellY = cy1;
    grid.minCellZ = cz0;
    grid.maxCellZ = cz1;
  } else {
    if (cx0 < grid.minCellX) grid.minCellX = cx0;
    if (cx1 > grid.maxCellX) grid.maxCellX = cx1;
    if (cy0 < grid.minCellY) grid.minCellY = cy0;
    if (cy1 > grid.maxCellY) grid.maxCellY = cy1;
    if (cz0 < grid.minCellZ) grid.minCellZ = cz0;
    if (cz1 > grid.maxCellZ) grid.maxCellZ = cz1;
  }
  return true;
}

// Reports whether an AABB contains the point (`x`,`y`,`z`).
function _isSpatialAabb3DContainsPoint(aabb: Readonly<SpatialAabb3D>, x: number, y: number, z: number): boolean {
  const minX = aabb.minX;
  const minY = aabb.minY;
  const minZ = aabb.minZ;
  const maxX = aabb.maxX;
  const maxY = aabb.maxY;
  const maxZ = aabb.maxZ;
  return x >= minX && x < maxX && y >= minY && y < maxY && z >= minZ && z < maxZ;
}

// Reports whether two AABBs overlap; face-touching counts as disjoint.
function _isSpatialAabb3DOverlapping(a: Readonly<SpatialAabb3D>, b: Readonly<SpatialAabb3D>): boolean {
  const aMinX = a.minX;
  const aMinY = a.minY;
  const aMinZ = a.minZ;
  const aMaxX = a.maxX;
  const aMaxY = a.maxY;
  const aMaxZ = a.maxZ;
  const bMinX = b.minX;
  const bMinY = b.minY;
  const bMinZ = b.minZ;
  const bMaxX = b.maxX;
  const bMaxY = b.maxY;
  const bMaxZ = b.maxZ;
  return aMinX < bMaxX && aMaxX > bMinX && aMinY < bMaxY && aMaxY > bMinY && aMinZ < bMaxZ && aMaxZ > bMinZ;
}

// Appends the pairs involving overflowed objects. An overflowed object occupies no cell, so the cell
// walk in _queryGrid3DPairs can never emit a pair for it and no dedup against that walk is needed. Its
// pairs are enumerated here instead: against every other indexed object, which is what "spans nearly
// the whole world" already means. Unlike the cell path these are filtered by a real AABB overlap test
// rather than emitted as bare locality candidates.
function _queryGrid3DOverflowPairs(grid: UniformGrid3D, out: SpatialPair[], written: number): number {
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (bounds === undefined) continue;
    for (const [otherId, otherBounds] of grid.bounds) {
      if (otherId === id) continue;
      // Each overflow×overflow pair would otherwise be emitted from both sides; taking it only from
      // the lower id emits it once. An overflow×celled pair reaches this test from one side only.
      if (grid.overflow.has(otherId) && otherId < id) continue;
      if (!_isSpatialAabb3DOverlapping(bounds, otherBounds)) continue;
      written =
        id < otherId ? _writeGrid3DPair(out, written, id, otherId) : _writeGrid3DPair(out, written, otherId, id);
    }
  }
  return written;
}

// Enumerates candidate pairs. Within each cell every co-occupant pair is a candidate, but a pair may
// share several cells; to emit it exactly once, a pair is emitted only from its canonical cell — the
// minimum-corner (min x, min y, min z) cell of the two objects' overlapping cell ranges, which both
// objects are guaranteed to occupy. Ids are ordered a < b so the unordered pair is canonical. A pair
// is never (a,a). The pair is a broadphase candidate (shared cell locality); the caller confirms real
// overlap.
function _queryGrid3DPairs(grid: UniformGrid3D, out: SpatialPair[]): void {
  let written = 0;
  const cs = grid.cellSize;
  const list = grid.pairIds;
  for (const cell of grid.cells.values()) {
    const ids = cell.ids;
    if (ids.size < 2) continue;
    list.length = 0;
    for (const id of ids) list.push(id);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        let a = list[i];
        let b = list[j];
        if (a > b) {
          const t = a;
          a = b;
          b = t;
        }
        const ab = grid.bounds.get(a);
        const bb = grid.bounds.get(b);
        if (ab === undefined || bb === undefined) continue;
        const canonicalX = Math.max(_cellIndex3D(ab.minX, cs), _cellIndex3D(bb.minX, cs));
        const canonicalY = Math.max(_cellIndex3D(ab.minY, cs), _cellIndex3D(bb.minY, cs));
        const canonicalZ = Math.max(_cellIndex3D(ab.minZ, cs), _cellIndex3D(bb.minZ, cs));
        if (cell.cx === canonicalX && cell.cy === canonicalY && cell.cz === canonicalZ) {
          written = _writeGrid3DPair(out, written, a, b);
        }
      }
    }
  }
  if (grid.overflow.size !== 0) written = _queryGrid3DOverflowPairs(grid, out, written);
  out.length = written;
}

// Rewrites a caller-owned high-water pair object instead of allocating one on every broadphase query.
// `out.length` is trimmed only after the gather, so every slot that survives from the previous query is
// still reachable while this one fills it.
function _writeGrid3DPair(out: SpatialPair[], index: number, a: SpatialObjectId, b: SpatialObjectId): number {
  const pair = out[index];
  if (pair === undefined) out.push({ a, b });
  else {
    pair.a = a;
    pair.b = b;
  }
  return index + 1;
}

// Gathers the ids in the cell containing the point, then confirms each against its real bounds. A
// single cell holds each id at most once, so no dedup pass is needed. Overflowed objects hold no cell
// and are tested directly; they cannot collide with the cell gather, so no dedup is needed there
// either.
function _queryGrid3DPoint(grid: UniformGrid3D, x: number, y: number, z: number, out: SpatialObjectId[]): void {
  out.length = 0;
  const cs = grid.cellSize;
  const cell = grid.cells.get(_cellKey3D(_cellIndex3D(x, cs), _cellIndex3D(y, cs), _cellIndex3D(z, cs)));
  if (cell !== undefined) {
    for (const id of cell.ids) {
      const bounds = grid.bounds.get(id);
      if (bounds !== undefined && _isSpatialAabb3DContainsPoint(bounds, x, y, z)) out.push(id);
    }
  }
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (bounds !== undefined && _isSpatialAabb3DContainsPoint(bounds, x, y, z)) out.push(id);
  }
}

// Walks the cells the ray crosses (bounded to the occupied cell range) via an amanatides-woo DDA
// carrying a third axis, gathering deduplicated ids, then confirms each against a real ray-vs-AABB
// slab test — so a cell co-occupant the ray does not actually strike is dropped. A zero-length
// direction degenerates to a point query at the origin. An empty grid returns nothing.
function _queryGrid3DRay(
  grid: UniformGrid3D,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  out: SpatialObjectId[],
): void {
  out.length = 0;
  const cs = grid.cellSize;
  const seen = grid.seen;
  seen.clear();
  if (dx === 0 && dy === 0 && dz === 0) {
    _queryGrid3DPoint(grid, ox, oy, oz, out);
    return;
  }
  // Overflowed objects are outside the cell range the DDA walks — deliberately, so one huge AABB
  // cannot stretch that range and make every ray traverse it — so they are slab-tested directly.
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (bounds !== undefined && _rayBox3DEntryT(ox, oy, oz, dx, dy, dz, bounds) >= 0) out.push(id);
  }
  // The cell range describes the CELLS, so the cells decide whether it means anything. Deriving this
  // rather than keeping an `empty` flag removes a whole class of defect: there is no flag that can
  // disagree with the structure it describes at any transition. The 2D grid learned this the hard way.
  if (grid.cells.size === 0) return;
  const rangeBounds: SpatialAabb3D = {
    minX: grid.minCellX * cs,
    minY: grid.minCellY * cs,
    minZ: grid.minCellZ * cs,
    maxX: (grid.maxCellX + 1) * cs,
    maxY: (grid.maxCellY + 1) * cs,
    maxZ: (grid.maxCellZ + 1) * cs,
  };
  const tEnter = _rayBox3DEntryT(ox, oy, oz, dx, dy, dz, rangeBounds);
  if (tEnter < 0) return;
  let cx = _cellIndex3D(ox + tEnter * dx, cs);
  let cy = _cellIndex3D(oy + tEnter * dy, cs);
  let cz = _cellIndex3D(oz + tEnter * dz, cs);
  if (cx < grid.minCellX) cx = grid.minCellX;
  else if (cx > grid.maxCellX) cx = grid.maxCellX;
  if (cy < grid.minCellY) cy = grid.minCellY;
  else if (cy > grid.maxCellY) cy = grid.maxCellY;
  if (cz < grid.minCellZ) cz = grid.minCellZ;
  else if (cz > grid.maxCellZ) cz = grid.maxCellZ;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  let tMaxX = Infinity;
  let tDeltaX = Infinity;
  if (stepX !== 0) {
    tMaxX = ((stepX > 0 ? (cx + 1) * cs : cx * cs) - ox) / dx;
    tDeltaX = cs / Math.abs(dx);
  }
  let tMaxY = Infinity;
  let tDeltaY = Infinity;
  if (stepY !== 0) {
    tMaxY = ((stepY > 0 ? (cy + 1) * cs : cy * cs) - oy) / dy;
    tDeltaY = cs / Math.abs(dy);
  }
  let tMaxZ = Infinity;
  let tDeltaZ = Infinity;
  if (stepZ !== 0) {
    tMaxZ = ((stepZ > 0 ? (cz + 1) * cs : cz * cs) - oz) / dz;
    tDeltaZ = cs / Math.abs(dz);
  }
  const maxSteps =
    grid.maxCellX - grid.minCellX + (grid.maxCellY - grid.minCellY) + (grid.maxCellZ - grid.minCellZ) + 4;
  for (let step = 0; step <= maxSteps; step++) {
    if (
      cx < grid.minCellX ||
      cx > grid.maxCellX ||
      cy < grid.minCellY ||
      cy > grid.maxCellY ||
      cz < grid.minCellZ ||
      cz > grid.maxCellZ
    ) {
      break;
    }
    const cell = grid.cells.get(_cellKey3D(cx, cy, cz));
    if (cell !== undefined) {
      for (const id of cell.ids) seen.add(id);
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      cy += stepY;
      tMaxY += tDeltaY;
    } else {
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  for (const id of seen) {
    const bounds = grid.bounds.get(id);
    if (bounds !== undefined && _rayBox3DEntryT(ox, oy, oz, dx, dy, dz, bounds) >= 0) out.push(id);
  }
}

// Gathers the ids in every cell the region covers (deduplicated via the reused scratch set), then
// confirms each against the region's real bounds — so a false cell-mate whose bounds miss the region
// is dropped. Overflowed objects hold no cell and are tested directly.
//
// The region is caller-supplied, so it carries the same unbounded-walk hazard the insert bound closes
// and needs its own guard: a query region wider than the world costs extent ÷ cellSize CUBED cell
// lookups against a grid that may hold one object. When the region spans more cells than the grid has
// occupied, walking the objects is both cheaper and exact, so the walk flips — a region query is never
// more expensive than a full scan.
function _queryGrid3DRegion(grid: UniformGrid3D, region: Readonly<SpatialAabb3D>, out: SpatialObjectId[]): void {
  out.length = 0;
  const cs = grid.cellSize;
  const seen = grid.seen;
  seen.clear();

  if (!(_spannedCellCount3D(cs, region) <= grid.cells.size)) {
    for (const [id, bounds] of grid.bounds) {
      if (_isSpatialAabb3DOverlapping(bounds, region)) out.push(id);
    }
    return;
  }

  const cx0 = _cellIndex3D(region.minX, cs);
  const cx1 = _cellIndex3D(region.maxX, cs);
  const cy0 = _cellIndex3D(region.minY, cs);
  const cy1 = _cellIndex3D(region.maxY, cs);
  const cz0 = _cellIndex3D(region.minZ, cs);
  const cz1 = _cellIndex3D(region.maxZ, cs);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = grid.cells.get(_cellKey3D(cx, cy, cz));
        if (cell === undefined) continue;
        for (const id of cell.ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          const bounds = grid.bounds.get(id);
          if (bounds !== undefined && _isSpatialAabb3DOverlapping(bounds, region)) out.push(id);
        }
      }
    }
  }
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (bounds !== undefined && _isSpatialAabb3DOverlapping(bounds, region)) out.push(id);
  }
}

// Slab test for a ray (origin `o*`, direction `d*`, `t >= 0`) against an axis-aligned box. Returns the
// entry parameter `t` (0 when the origin is already inside), or -1 when the ray misses the box or the
// box lies entirely behind the origin. Direction need not be normalized.
function _rayBox3DEntryT(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: Readonly<SpatialAabb3D>,
): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  if (dx !== 0) {
    const inv = 1 / dx;
    let t1 = (box.minX - ox) * inv;
    let t2 = (box.maxX - ox) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  } else if (ox < box.minX || ox > box.maxX) {
    return -1;
  }
  if (dy !== 0) {
    const inv = 1 / dy;
    let t1 = (box.minY - oy) * inv;
    let t2 = (box.maxY - oy) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  } else if (oy < box.minY || oy > box.maxY) {
    return -1;
  }
  if (dz !== 0) {
    const inv = 1 / dz;
    let t1 = (box.minZ - oz) * inv;
    let t2 = (box.maxZ - oz) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  } else if (oz < box.minZ || oz > box.maxZ) {
    return -1;
  }
  if (tmax < tmin || tmax < 0) return -1;
  return tmin > 0 ? tmin : 0;
}

// Removes an object from every cell its stored AABB covered and drops now-empty cells. The occupied
// cell range is intentionally not shrunk (only reset when the grid fully empties). A no-op for an
// unknown id. Overflowed and declined ids leave through their own sets without a cell walk — remove
// re-derives the cell range from the stored bounds, so an overflowed object taking the ordinary path
// here would reintroduce exactly the unbounded walk the insert bound removed.
function _removeFromGrid3D(grid: UniformGrid3D, id: SpatialObjectId): void {
  grid.declined.delete(id);
  const bounds = grid.bounds.get(id);
  if (bounds === undefined) return;
  if (grid.overflow.delete(id)) {
    grid.bounds.delete(id);
    return;
  }
  const cs = grid.cellSize;
  const cx0 = _cellIndex3D(bounds.minX, cs);
  const cx1 = _cellIndex3D(bounds.maxX, cs);
  const cy0 = _cellIndex3D(bounds.minY, cs);
  const cy1 = _cellIndex3D(bounds.maxY, cs);
  const cz0 = _cellIndex3D(bounds.minZ, cs);
  const cz1 = _cellIndex3D(bounds.maxZ, cs);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = _cellKey3D(cx, cy, cz);
        const cell = grid.cells.get(key);
        if (cell === undefined) continue;
        cell.ids.delete(id);
        if (cell.ids.size === 0) grid.cells.delete(key);
      }
    }
  }
  grid.bounds.delete(id);
}

function _reportGrid3DIndexing(
  grid: Readonly<UniformGrid3D>,
  id: SpatialObjectId,
  mode: SpatialIndexingMode,
  operation: SpatialIndexingOperation,
  reason: SpatialIndexingReason | null,
  wouldOccupyBucketCount: number,
): void {
  reportSpatialIndexing({ cellSize: grid.cellSize, id, mode, operation, reason, wouldOccupyBucketCount });
}

// How many cells an AABB's span covers, as a count rather than a walk — the number the per-object
// budget is compared against, computed before any cell is touched. Returns NaN for bounds or a cell
// size that make the cell indices non-finite; callers test it with a negated `<=` so NaN falls to the
// bounded path rather than through it.
function _spannedCellCount3D(cellSize: number, aabb: Readonly<SpatialAabb3D>): number {
  const cx0 = _cellIndex3D(aabb.minX, cellSize);
  const cx1 = _cellIndex3D(aabb.maxX, cellSize);
  const cy0 = _cellIndex3D(aabb.minY, cellSize);
  const cy1 = _cellIndex3D(aabb.maxY, cellSize);
  const cz0 = _cellIndex3D(aabb.minZ, cellSize);
  const cz1 = _cellIndex3D(aabb.maxZ, cellSize);
  return (cx1 - cx0 + 1) * (cy1 - cy0 + 1) * (cz1 - cz0 + 1);
}

// Updates an object's private AABB copy without touching its cell sets when both the old and new
// bounds take the ordinary indexing path and cover exactly the same cells. Small per-frame movement
// usually stays inside this range, so its dominant cost becomes six field writes instead of a
// remove-and-reinsert walk. Every mode or range transition keeps using the shared slow path below.
function _updateGrid3DObject(grid: UniformGrid3D, id: SpatialObjectId, bounds: Readonly<SpatialAabb3D>): boolean {
  const wasMissing = !grid.bounds.has(id) && !grid.declined.has(id);
  const previous = grid.bounds.get(id);
  if (
    previous !== undefined &&
    !grid.overflow.has(id) &&
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.minZ) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY) &&
    Number.isFinite(bounds.maxZ) &&
    bounds.minX <= bounds.maxX &&
    bounds.minY <= bounds.maxY &&
    bounds.minZ <= bounds.maxZ
  ) {
    const cs = grid.cellSize;
    const spanned = _spannedCellCount3D(cs, bounds);
    if (
      spanned <= MAX_INDEXED_CELLS_PER_OBJECT &&
      _cellIndex3D(previous.minX, cs) === _cellIndex3D(bounds.minX, cs) &&
      _cellIndex3D(previous.minY, cs) === _cellIndex3D(bounds.minY, cs) &&
      _cellIndex3D(previous.minZ, cs) === _cellIndex3D(bounds.minZ, cs) &&
      _cellIndex3D(previous.maxX, cs) === _cellIndex3D(bounds.maxX, cs) &&
      _cellIndex3D(previous.maxY, cs) === _cellIndex3D(bounds.maxY, cs) &&
      _cellIndex3D(previous.maxZ, cs) === _cellIndex3D(bounds.maxZ, cs)
    ) {
      previous.minX = bounds.minX;
      previous.minY = bounds.minY;
      previous.minZ = bounds.minZ;
      previous.maxX = bounds.maxX;
      previous.maxY = bounds.maxY;
      previous.maxZ = bounds.maxZ;
      return true;
    }
  }
  _removeFromGrid3D(grid, id);
  const inserted = _insertIntoGrid3D(grid, id, bounds, 'update');
  if (wasMissing) {
    const explanation = _explainGrid3DIndexing(grid, id);
    _reportGrid3DIndexing(grid, id, explanation.mode, 'update', 'missing-id', 0);
  }
  return inserted;
}
