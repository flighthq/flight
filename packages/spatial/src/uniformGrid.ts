import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  SpatialAabb2D,
  SpatialIndexBackend2D,
  SpatialDeclineReason,
  SpatialIndexingExplanation,
  SpatialIndexingMode,
  SpatialIndexingOperation,
  SpatialIndexingReason,
  SpatialObjectId,
  SpatialPair,
} from '@flighthq/types/contract';

import { reportSpatialIndexing } from './spatialIndexingGuard';

// The per-object cell budget. An object whose AABB covers more cells than this is held in the flat
// overflow list instead of being written into every cell it spans.
//
// This bound is what makes insert cost independent of object size. Without it the cell walk is
// proportional to extent ÷ cellSize *squared*, so cost is set by the largest object rather than by
// the object count: measured on this grid at one cell per unit, a 200-unit box costs 40k cell writes
// (~28 ms) and a 2000-unit box costs 4M (~4.7 s), while an AABB a trillion units wide — reachable
// from any diverging simulation — never returns at all. A hang is worse than a throw because it is
// uncatchable and takes the caller with it.
//
// Overflow is not a degraded result: an object that spans a thousand cells is a co-occupant of nearly
// everything, so the cell index tells the queries almost nothing and a linear scan answers the same
// question at a bounded cost. 1024 cells is a 32×32 block — an object 32× the cell size on each axis,
// far past the "cell size ≈ typical object size" the grid is built around. An object over the budget
// is a signal the cell size is wrong for the workload, which the indexing guard reports.
export const MAX_INDEXED_CELLS_PER_OBJECT = 1024;

// Builds a uniform-grid (spatial-hash) backend: an object's AABB is mapped to the rectangular block
// of fixed-size cells it covers, and each cell holds the ids overlapping it. Co-located objects share
// a cell, so candidate pairs and region/point/ray hits are found by looking only at the relevant
// cells instead of scanning every object. `cellSize` is the world-space side length of one cell; a
// good value is a positive finite number roughly the size of a typical object (too small over-spans
// large objects across many cells, too large lumps unrelated objects together). An invalid size uses
// the bounded overflow path to keep results correct and reports through the indexing guard. No
// import-time side effect — the caller constructs a grid explicitly, and createSpatialIndex2D uses
// this as its default index.
//
// Object size does not set the cost: an AABB spanning more than MAX_INDEXED_CELLS_PER_OBJECT cells
// goes to a flat overflow list that every query scans, and non-finite or inverted bounds are declined
// outright with a false sentinel. Both are visible through explainSpatialIndexing2D.
export function createUniformGridSpatialBackend2D(cellSize: number): SpatialIndexBackend2D & Entity {
  const grid: UniformGrid = {
    cellSize,
    cells: new Map(),
    bounds: new Map(),
    overflow: new Set(),
    declined: new Map(),
    minCellX: 0,
    minCellY: 0,
    maxCellX: 0,
    maxCellY: 0,
    seen: new Set(),
    pairIds: [],
  };
  const out = allocateEntity<SpatialIndexBackend2D & Entity>();
  initializeUniformGridSpatialBackend2D(out, grid);
  return finishEntity(out);
}

export function initializeUniformGridSpatialBackend2D(
  out: EntityConstruction<SpatialIndexBackend2D & Entity>,
  grid: UniformGrid,
): void {
  out.clearSpatialIndex = () => {
    grid.cells.clear();
    grid.bounds.clear();
    grid.overflow.clear();
    grid.declined.clear();
    grid.seen.clear();
    grid.pairIds.length = 0;
  };
  out.explainSpatialIndexing = (id) => _explainGridIndexing(grid, id);
  out.insertSpatialObject = (id, bounds) => _insertIntoGrid(grid, id, bounds, 'insert');
  out.querySpatialPairs = (queryOut) => {
    _queryGridPairs(grid, queryOut);
  };
  out.querySpatialPoint = (x, y, queryOut) => {
    _queryGridPoint(grid, x, y, queryOut);
  };
  out.querySpatialRay = (x, y, dx, dy, queryOut) => {
    _queryGridRay(grid, x, y, dx, dy, queryOut);
  };
  out.querySpatialRegion = (region, queryOut) => {
    _queryGridRegion(grid, region, queryOut);
  };
  out.removeSpatialObject = (id) => {
    const wasMissing = !grid.bounds.has(id) && !grid.declined.has(id);
    _removeFromGrid(grid, id);
    if (wasMissing) _reportGridIndexing(grid, id, 'absent', 'remove', 'missing-id', 0);
  };
  out.updateSpatialObject = (id, bounds) => _updateGridObject(grid, id, bounds);
}

// One occupied cell: its integer cell coordinates and the ids whose bounds cover it. The coordinates
// are stored (not just parsed back from the map key) so pair dedup can test the current cell against
// a pair's canonical cell without string work.
interface GridCell {
  cx: number;
  cy: number;
  ids: Set<SpatialObjectId>;
}

// Internal state of one uniform grid. `bounds` keeps each object's stored (copied) AABB so update and
// remove can find the cells it previously covered, and so region/point/ray results can be confirmed
// against the real bounds — it holds every indexed object, whether celled or overflowed, and is what
// every query falls back to scanning. `overflow` holds the ids too large to bucket, `declined` the
// ids whose bounds could not be indexed at all (those have no `bounds` entry, so no query can reach
// them). `pairIds` is the reused cell-enumeration scratch array and `seen` is the reused gather set;
// both are cleared per query, never reallocated. `minCell*`/`maxCell*` track the occupied cell range
// for ray traversal; they only ever expand while celled objects exist (remove does not shrink them —
// a conservative over-walk) and reset when the grid empties. Keeping overflowed objects out of that
// range is a second reason the bound matters: one oversized AABB would otherwise stretch the range
// and make every ray walk it.
interface UniformGrid {
  cellSize: number;
  cells: Map<string, GridCell>;
  bounds: Map<SpatialObjectId, SpatialAabb2D>;
  overflow: Set<SpatialObjectId>;
  declined: Map<SpatialObjectId, SpatialDeclineReason>;
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
  seen: Set<SpatialObjectId>;
  pairIds: SpatialObjectId[];
}

// Maps a world coordinate to its cell index along one axis. Uses floor so negative coordinates map
// to consistently decreasing cell indices (world 0 is the boundary between cell -1 and cell 0).
function _cellIndex(coord: number, cellSize: number): number {
  return Math.floor(coord / cellSize);
}

// The map key for a cell. A string of the two signed integer coordinates — negatives and large
// magnitudes are represented exactly, unlike a numeric pairing that could overflow or collide.
function _cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

// Reports how `id` is currently held. Pure: reads only, allocates only the returned record.
function _explainGridIndexing(grid: UniformGrid, id: SpatialObjectId): SpatialIndexingExplanation {
  const declineReason = grid.declined.get(id);
  if (declineReason !== undefined) return { bucketCount: 0, id, mode: 'declined', reason: declineReason };
  if (grid.overflow.has(id)) return { bucketCount: 0, id, mode: 'overflow', reason: null };
  const bounds = grid.bounds.get(id);
  if (bounds === undefined) return { bucketCount: 0, id, mode: 'absent', reason: null };
  return { bucketCount: _spannedCellCount(grid.cellSize, bounds), id, mode: 'cells', reason: null };
}

// Adds an object to the index, storing a private copy of the bounds; the caller may safely mutate or
// reuse the passed bounds afterward. Returns false only for bounds that cannot be indexed at all.
//
// Five outcomes, and which one applies is decided *before* any cell is touched — that ordering is
// the whole point, since deciding afterward would mean walking the cells to find out they were too
// many:
//   - non-finite bounds are declined. There is no cell range to compute, and storing them would let a
//     NaN leak into every later overlap test, so the object is left out of the index entirely and the
//     caller gets a false sentinel rather than an exception or a silent no-op.
//   - inverted bounds are likewise declined because min/max corners do not describe an AABB.
//   - a non-positive or non-finite cell size routes valid objects to overflow, preserving query
//     correctness through the bounded flat scan while the indexing guard reports the configuration.
//   - bounds spanning more than MAX_INDEXED_CELLS_PER_OBJECT cells go to the overflow list, which
//     every query scans. Bounded by the object count instead of the object's size.
//   - everything else takes the ordinary path: one entry in each cell it covers.
function _insertIntoGrid(
  grid: UniformGrid,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb2D>,
  operation: SpatialIndexingOperation,
): boolean {
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    grid.declined.set(id, 'non-finite-bounds');
    _reportGridIndexing(grid, id, 'declined', operation, 'non-finite-bounds', 0);
    return false;
  }
  if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) {
    grid.declined.set(id, 'inverted-bounds');
    _reportGridIndexing(grid, id, 'declined', operation, 'inverted-bounds', 0);
    return false;
  }

  const cs = grid.cellSize;
  const copy = { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
  if (!(cs > 0 && Number.isFinite(cs))) {
    grid.bounds.set(id, copy);
    grid.overflow.add(id);
    _reportGridIndexing(grid, id, 'overflow', operation, 'invalid-cell-size', 0);
    return true;
  }
  const spanned = _spannedCellCount(cs, copy);
  // Written as a negated `<=` so an unrepresentable span falls to overflow rather than through to a
  // loop that cannot index it.
  if (!(spanned <= MAX_INDEXED_CELLS_PER_OBJECT)) {
    grid.bounds.set(id, copy);
    grid.overflow.add(id);
    _reportGridIndexing(grid, id, 'overflow', operation, null, spanned);
    return true;
  }

  const cx0 = _cellIndex(copy.minX, cs);
  const cx1 = _cellIndex(copy.maxX, cs);
  const cy0 = _cellIndex(copy.minY, cs);
  const cy1 = _cellIndex(copy.maxY, cs);
  // Whether a cell range exists yet, read *before* this object's cells are added. A first celled
  // object seeds the range; a later one widens it.
  const hadCells = grid.cells.size !== 0;
  grid.bounds.set(id, copy);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = _cellKey(cx, cy);
      let cell = grid.cells.get(key);
      if (cell === undefined) {
        cell = { cx, cy, ids: new Set() };
        grid.cells.set(key, cell);
      }
      cell.ids.add(id);
    }
  }
  if (!hadCells) {
    grid.minCellX = cx0;
    grid.maxCellX = cx1;
    grid.minCellY = cy0;
    grid.maxCellY = cy1;
  } else {
    if (cx0 < grid.minCellX) grid.minCellX = cx0;
    if (cx1 > grid.maxCellX) grid.maxCellX = cx1;
    if (cy0 < grid.minCellY) grid.minCellY = cy0;
    if (cy1 > grid.maxCellY) grid.maxCellY = cy1;
  }
  return true;
}

// Updates an object's private AABB copy without touching its cell sets when both the old and new
// bounds take the ordinary indexing path and cover exactly the same cells. Small per-frame movement
// usually stays inside this range, so its dominant cost becomes four field writes instead of a
// remove-and-reinsert walk. Every mode or range transition keeps using the shared slow path below.
function _updateGridObject(grid: UniformGrid, id: SpatialObjectId, bounds: Readonly<SpatialAabb2D>): boolean {
  const wasMissing = !grid.bounds.has(id) && !grid.declined.has(id);
  const previous = grid.bounds.get(id);
  if (
    previous !== undefined &&
    !grid.overflow.has(id) &&
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY) &&
    bounds.minX <= bounds.maxX &&
    bounds.minY <= bounds.maxY
  ) {
    const cs = grid.cellSize;
    const spanned = _spannedCellCount(cs, bounds);
    if (
      spanned <= MAX_INDEXED_CELLS_PER_OBJECT &&
      _cellIndex(previous.minX, cs) === _cellIndex(bounds.minX, cs) &&
      _cellIndex(previous.minY, cs) === _cellIndex(bounds.minY, cs) &&
      _cellIndex(previous.maxX, cs) === _cellIndex(bounds.maxX, cs) &&
      _cellIndex(previous.maxY, cs) === _cellIndex(bounds.maxY, cs)
    ) {
      previous.minX = bounds.minX;
      previous.minY = bounds.minY;
      previous.maxX = bounds.maxX;
      previous.maxY = bounds.maxY;
      return true;
    }
  }
  _removeFromGrid(grid, id);
  const inserted = _insertIntoGrid(grid, id, bounds, 'update');
  if (wasMissing) {
    const explanation = _explainGridIndexing(grid, id);
    _reportGridIndexing(grid, id, explanation.mode, 'update', 'missing-id', 0);
  }
  return inserted;
}

// Reports whether an AABB contains the point (`x`,`y`).
function _isSpatialAabbContainsPoint(aabb: Readonly<SpatialAabb2D>, x: number, y: number): boolean {
  const minX = aabb.minX;
  const minY = aabb.minY;
  const maxX = aabb.maxX;
  const maxY = aabb.maxY;
  return x >= minX && x < maxX && y >= minY && y < maxY;
}

// Reports whether two AABBs overlap; edge-touching counts as disjoint.
function _isSpatialAabbOverlapping(a: Readonly<SpatialAabb2D>, b: Readonly<SpatialAabb2D>): boolean {
  const aMinX = a.minX;
  const aMinY = a.minY;
  const aMaxX = a.maxX;
  const aMaxY = a.maxY;
  const bMinX = b.minX;
  const bMinY = b.minY;
  const bMaxX = b.maxX;
  const bMaxY = b.maxY;
  return aMinX < bMaxX && aMaxX > bMinX && aMinY < bMaxY && aMaxY > bMinY;
}

// Slab test for a ray (origin `ox`,`oy`, direction `dx`,`dy`, `t >= 0`) against an axis-aligned box.
// Returns the entry parameter `t` (0 when the origin is already inside), or -1 when the ray misses
// the box or the box lies entirely behind the origin. Direction need not be normalized.
function _rayBoxEntryT(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  if (dx !== 0) {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  } else if (ox < minX || ox > maxX) {
    return -1;
  }
  if (dy !== 0) {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  } else if (oy < minY || oy > maxY) {
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
function _removeFromGrid(grid: UniformGrid, id: SpatialObjectId): void {
  grid.declined.delete(id);
  const bounds = grid.bounds.get(id);
  if (bounds === undefined) return;
  if (grid.overflow.delete(id)) {
    grid.bounds.delete(id);
    return;
  }
  const cs = grid.cellSize;
  const cx0 = _cellIndex(bounds.minX, cs);
  const cx1 = _cellIndex(bounds.maxX, cs);
  const cy0 = _cellIndex(bounds.minY, cs);
  const cy1 = _cellIndex(bounds.maxY, cs);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = _cellKey(cx, cy);
      const cell = grid.cells.get(key);
      if (cell === undefined) continue;
      cell.ids.delete(id);
      if (cell.ids.size === 0) grid.cells.delete(key);
    }
  }
  grid.bounds.delete(id);
}

// Appends the pairs involving overflowed objects. An overflowed object occupies no cell, so the cell
// walk in _queryGridPairs can never emit a pair for it and no dedup against that walk is needed. Its
// pairs are enumerated here instead: against every other indexed object, which is what "spans nearly
// the whole world" already means. Unlike the cell path these are filtered by a real AABB overlap test
// rather than emitted as bare locality candidates — the result stays a superset of the true overlaps
// either way, and an object this large would otherwise nominate every other object every frame.
function _queryGridOverflowPairs(grid: UniformGrid, out: SpatialPair[]): void {
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (bounds === undefined) continue;
    for (const [otherId, otherBounds] of grid.bounds) {
      if (otherId === id) continue;
      // Each overflow×overflow pair would otherwise be emitted from both sides; taking it only from
      // the lower id emits it once. An overflow×celled pair reaches this test from one side only.
      if (grid.overflow.has(otherId) && otherId < id) continue;
      if (!_isSpatialAabbOverlapping(bounds, otherBounds)) continue;
      out.push(id < otherId ? { a: id, b: otherId } : { a: otherId, b: id });
    }
  }
}

// Enumerates candidate pairs. Within each cell every co-occupant pair is a candidate, but a pair may
// share several cells; to emit it exactly once, a pair is emitted only from its canonical cell — the
// top-left (min x, min y) cell of the two objects' overlapping cell ranges, which both objects are
// guaranteed to occupy. Ids are ordered a < b so the unordered pair is canonical. A pair is never
// (a,a). The pair is a broadphase candidate (shared cell locality); the caller confirms real overlap.
function _queryGridPairs(grid: UniformGrid, out: SpatialPair[]): void {
  out.length = 0;
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
        const canonicalX = Math.max(_cellIndex(ab.minX, cs), _cellIndex(bb.minX, cs));
        const canonicalY = Math.max(_cellIndex(ab.minY, cs), _cellIndex(bb.minY, cs));
        if (cell.cx === canonicalX && cell.cy === canonicalY) out.push({ a, b });
      }
    }
  }
  if (grid.overflow.size !== 0) _queryGridOverflowPairs(grid, out);
}

function _reportGridIndexing(
  grid: Readonly<UniformGrid>,
  id: SpatialObjectId,
  mode: SpatialIndexingMode,
  operation: SpatialIndexingOperation,
  reason: SpatialIndexingReason | null,
  wouldOccupyBucketCount: number,
): void {
  reportSpatialIndexing({ cellSize: grid.cellSize, id, mode, operation, reason, wouldOccupyBucketCount });
}

// Gathers the ids in the cell containing the point, then confirms each against its real bounds. A
// single cell holds each id at most once, so no dedup pass is needed. Overflowed objects hold no cell
// and are tested directly; they cannot collide with the cell gather, so no dedup is needed there
// either.
function _queryGridPoint(grid: UniformGrid, x: number, y: number, out: SpatialObjectId[]): void {
  out.length = 0;
  const cs = grid.cellSize;
  const cell = grid.cells.get(_cellKey(_cellIndex(x, cs), _cellIndex(y, cs)));
  if (cell !== undefined) {
    for (const id of cell.ids) {
      const bounds = grid.bounds.get(id);
      if (bounds !== undefined && _isSpatialAabbContainsPoint(bounds, x, y)) out.push(id);
    }
  }
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (bounds !== undefined && _isSpatialAabbContainsPoint(bounds, x, y)) out.push(id);
  }
}

// Walks the cells the ray crosses (bounded to the occupied cell range) via an amanatides-woo DDA,
// gathering deduplicated ids, then confirms each against a real ray-vs-AABB slab test — so a cell
// co-occupant the ray does not actually strike is dropped. A zero-length direction degenerates to a
// point query at the origin. An empty grid returns nothing.
function _queryGridRay(
  grid: UniformGrid,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  out: SpatialObjectId[],
): void {
  out.length = 0;
  const cs = grid.cellSize;
  const seen = grid.seen;
  seen.clear();
  if (dx === 0 && dy === 0) {
    _queryGridPoint(grid, ox, oy, out);
    return;
  }
  // Overflowed objects are outside the cell range the DDA walks — deliberately, so one huge AABB
  // cannot stretch that range and make every ray traverse it — so they are slab-tested directly.
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (
      bounds !== undefined &&
      _rayBoxEntryT(ox, oy, dx, dy, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY) >= 0
    ) {
      out.push(id);
    }
  }
  // The cell range describes the CELLS, so the cells decide whether it means anything. Reading a
  // separately-maintained `empty` flag here was the defect: it was set from `bounds.size`, which counts
  // overflowed objects too, so removing the last CELLED object while any overflowed object remained
  // left the flag false and the min/max range stale — and this walk then stepped across that stale
  // range, unbounded, with no cells left to find. Deriving the fact removes the class: there is no
  // longer a flag that can disagree with the structure it describes, at any transition.
  if (grid.cells.size === 0) return;
  const boxMinX = grid.minCellX * cs;
  const boxMinY = grid.minCellY * cs;
  const boxMaxX = (grid.maxCellX + 1) * cs;
  const boxMaxY = (grid.maxCellY + 1) * cs;
  const tEnter = _rayBoxEntryT(ox, oy, dx, dy, boxMinX, boxMinY, boxMaxX, boxMaxY);
  if (tEnter < 0) return;
  const startX = ox + tEnter * dx;
  const startY = oy + tEnter * dy;
  let cx = _cellIndex(startX, cs);
  let cy = _cellIndex(startY, cs);
  if (cx < grid.minCellX) cx = grid.minCellX;
  else if (cx > grid.maxCellX) cx = grid.maxCellX;
  if (cy < grid.minCellY) cy = grid.minCellY;
  else if (cy > grid.maxCellY) cy = grid.maxCellY;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  let tMaxX = Infinity;
  let tDeltaX = Infinity;
  if (stepX !== 0) {
    const boundary = stepX > 0 ? (cx + 1) * cs : cx * cs;
    tMaxX = (boundary - ox) / dx;
    tDeltaX = cs / Math.abs(dx);
  }
  let tMaxY = Infinity;
  let tDeltaY = Infinity;
  if (stepY !== 0) {
    const boundary = stepY > 0 ? (cy + 1) * cs : cy * cs;
    tMaxY = (boundary - oy) / dy;
    tDeltaY = cs / Math.abs(dy);
  }
  const maxSteps = grid.maxCellX - grid.minCellX + (grid.maxCellY - grid.minCellY) + 3;
  for (let step = 0; step <= maxSteps; step++) {
    if (cx < grid.minCellX || cx > grid.maxCellX || cy < grid.minCellY || cy > grid.maxCellY) break;
    const cell = grid.cells.get(_cellKey(cx, cy));
    if (cell !== undefined) {
      for (const id of cell.ids) seen.add(id);
    }
    if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      tMaxY += tDeltaY;
    }
  }
  for (const id of seen) {
    const bounds = grid.bounds.get(id);
    if (
      bounds !== undefined &&
      _rayBoxEntryT(ox, oy, dx, dy, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY) >= 0
    ) {
      out.push(id);
    }
  }
}

// Gathers the ids in every cell the region covers (deduplicated via the reused scratch set), then
// confirms each against the region's real bounds — so a false cell-mate whose bounds miss the region
// is dropped. Overflowed objects hold no cell and are tested directly.
//
// The region is caller-supplied, so it carries the same unbounded-walk hazard the insert bound closes
// and needs its own guard: a query region wider than the world costs extent ÷ cellSize squared cell
// lookups against a grid that may hold one object. When the region spans more cells than the grid has
// occupied, walking the objects is both cheaper and exact, so the walk flips — a region query is
// never more expensive than a full scan.
function _queryGridRegion(grid: UniformGrid, region: Readonly<SpatialAabb2D>, out: SpatialObjectId[]): void {
  out.length = 0;
  const cs = grid.cellSize;
  const seen = grid.seen;
  seen.clear();

  if (!(_spannedCellCount(cs, region) <= grid.cells.size)) {
    for (const [id, bounds] of grid.bounds) {
      if (_isSpatialAabbOverlapping(bounds, region)) out.push(id);
    }
    return;
  }

  const cx0 = _cellIndex(region.minX, cs);
  const cx1 = _cellIndex(region.maxX, cs);
  const cy0 = _cellIndex(region.minY, cs);
  const cy1 = _cellIndex(region.maxY, cs);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const cell = grid.cells.get(_cellKey(cx, cy));
      if (cell === undefined) continue;
      for (const id of cell.ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const bounds = grid.bounds.get(id);
        if (bounds !== undefined && _isSpatialAabbOverlapping(bounds, region)) out.push(id);
      }
    }
  }
  for (const id of grid.overflow) {
    const bounds = grid.bounds.get(id);
    if (bounds !== undefined && _isSpatialAabbOverlapping(bounds, region)) out.push(id);
  }
}

// How many cells an AABB's span covers, as a count rather than a walk — the number the per-object
// budget is compared against, computed before any cell is touched. Returns NaN for bounds or a cell
// size that make the cell indices non-finite; callers test it with a negated `<=` so NaN falls to the
// bounded path rather than through it.
function _spannedCellCount(cellSize: number, aabb: Readonly<SpatialAabb2D>): number {
  const cx0 = _cellIndex(aabb.minX, cellSize);
  const cx1 = _cellIndex(aabb.maxX, cellSize);
  const cy0 = _cellIndex(aabb.minY, cellSize);
  const cy1 = _cellIndex(aabb.maxY, cellSize);
  return (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
}
