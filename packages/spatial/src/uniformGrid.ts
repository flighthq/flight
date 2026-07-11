import { containsRectanglePointXY, intersectsRectangle } from '@flighthq/geometry';
import type { RectangleLike, SpatialAabb, SpatialIndexBackend, SpatialObjectId, SpatialPair } from '@flighthq/types';

// Builds a uniform-grid (spatial-hash) backend: an object's AABB is mapped to the rectangular block
// of fixed-size cells it covers, and each cell holds the ids overlapping it. Co-located objects share
// a cell, so candidate pairs and region/point/ray hits are found by looking only at the relevant
// cells instead of scanning every object. `cellSize` is the world-space side length of one cell; a
// good value is roughly the size of a typical object (too small over-spans large objects across many
// cells, too large lumps unrelated objects together). No import-time side effect — the caller
// constructs a grid explicitly, and createSpatialIndex uses this as its default index.
export function createUniformGridSpatialBackend(cellSize: number): SpatialIndexBackend {
  const grid: UniformGrid = {
    cellSize,
    cells: new Map(),
    bounds: new Map(),
    minCellX: 0,
    minCellY: 0,
    maxCellX: 0,
    maxCellY: 0,
    empty: true,
    seen: new Set(),
  };
  return {
    insertSpatialObject(id, bounds) {
      _insertIntoGrid(grid, id, bounds);
    },
    updateSpatialObject(id, bounds) {
      _removeFromGrid(grid, id);
      _insertIntoGrid(grid, id, bounds);
    },
    removeSpatialObject(id) {
      _removeFromGrid(grid, id);
    },
    clearSpatialIndex() {
      grid.cells.clear();
      grid.bounds.clear();
      grid.seen.clear();
      grid.empty = true;
    },
    querySpatialPairs(out) {
      _queryGridPairs(grid, out);
    },
    querySpatialRegion(region, out) {
      _queryGridRegion(grid, region, out);
    },
    querySpatialPoint(x, y, out) {
      _queryGridPoint(grid, x, y, out);
    },
    querySpatialRay(x, y, dx, dy, out) {
      _queryGridRay(grid, x, y, dx, dy, out);
    },
  };
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
// against the real bounds. `minCell*`/`maxCell*` track the occupied cell range for ray traversal;
// they only ever expand while objects exist (remove does not shrink them — a conservative over-walk)
// and reset when the grid empties. `seen` is a reused scratch set for gather dedup — cleared per
// query, never reallocated.
interface UniformGrid {
  cellSize: number;
  cells: Map<string, GridCell>;
  bounds: Map<SpatialObjectId, SpatialAabb>;
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
  empty: boolean;
  seen: Set<SpatialObjectId>;
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

// Fills a scratch RectangleLike (x/y/width/height) from a SpatialAabb (min/max corners) so the
// geometry rectangle-overlap and point-containment helpers can be reused instead of re-deriving the
// AABB math here. Assumes a normalized AABB (max >= min); a flipped AABB yields a negative extent,
// which the geometry helpers still normalize internally.
function _fillRectFromAabb(out: RectangleLike, aabb: Readonly<SpatialAabb>): void {
  out.x = aabb.minX;
  out.y = aabb.minY;
  out.width = aabb.maxX - aabb.minX;
  out.height = aabb.maxY - aabb.minY;
}

// Adds an object to every cell its AABB covers, storing a private copy of the bounds and expanding
// the occupied cell range. The caller may safely mutate or reuse the passed bounds afterward.
function _insertIntoGrid(grid: UniformGrid, id: SpatialObjectId, bounds: Readonly<SpatialAabb>): void {
  const cs = grid.cellSize;
  const cx0 = _cellIndex(bounds.minX, cs);
  const cx1 = _cellIndex(bounds.maxX, cs);
  const cy0 = _cellIndex(bounds.minY, cs);
  const cy1 = _cellIndex(bounds.maxY, cs);
  grid.bounds.set(id, { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY });
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
  if (grid.empty) {
    grid.minCellX = cx0;
    grid.maxCellX = cx1;
    grid.minCellY = cy0;
    grid.maxCellY = cy1;
    grid.empty = false;
  } else {
    if (cx0 < grid.minCellX) grid.minCellX = cx0;
    if (cx1 > grid.maxCellX) grid.maxCellX = cx1;
    if (cy0 < grid.minCellY) grid.minCellY = cy0;
    if (cy1 > grid.maxCellY) grid.maxCellY = cy1;
  }
}

// Reports whether an AABB contains the point (`x`,`y`), reusing the geometry rectangle helper.
function _isSpatialAabbContainsPoint(aabb: Readonly<SpatialAabb>, x: number, y: number): boolean {
  _fillRectFromAabb(_scratchRectA, aabb);
  return containsRectanglePointXY(_scratchRectA, x, y);
}

// Reports whether two AABBs overlap, reusing the geometry rectangle-overlap helper (edge-touching
// counts as disjoint, matching intersectsRectangle).
function _isSpatialAabbOverlapping(a: Readonly<SpatialAabb>, b: Readonly<SpatialAabb>): boolean {
  _fillRectFromAabb(_scratchRectA, a);
  _fillRectFromAabb(_scratchRectB, b);
  return intersectsRectangle(_scratchRectA, _scratchRectB);
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
// unknown id.
function _removeFromGrid(grid: UniformGrid, id: SpatialObjectId): void {
  const bounds = grid.bounds.get(id);
  if (bounds === undefined) return;
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
  if (grid.bounds.size === 0) grid.empty = true;
}

// Enumerates candidate pairs. Within each cell every co-occupant pair is a candidate, but a pair may
// share several cells; to emit it exactly once, a pair is emitted only from its canonical cell — the
// top-left (min x, min y) cell of the two objects' overlapping cell ranges, which both objects are
// guaranteed to occupy. Ids are ordered a < b so the unordered pair is canonical. A pair is never
// (a,a). The pair is a broadphase candidate (shared cell locality); the caller confirms real overlap.
function _queryGridPairs(grid: UniformGrid, out: SpatialPair[]): void {
  out.length = 0;
  const cs = grid.cellSize;
  for (const cell of grid.cells.values()) {
    const ids = cell.ids;
    if (ids.size < 2) continue;
    const list = [...ids];
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
}

// Gathers the ids in the cell containing the point, then confirms each against its real bounds. A
// single cell holds each id at most once, so no dedup pass is needed.
function _queryGridPoint(grid: UniformGrid, x: number, y: number, out: SpatialObjectId[]): void {
  out.length = 0;
  const cs = grid.cellSize;
  const cell = grid.cells.get(_cellKey(_cellIndex(x, cs), _cellIndex(y, cs)));
  if (cell === undefined) return;
  for (const id of cell.ids) {
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
  if (grid.empty) return;
  const cs = grid.cellSize;
  const seen = grid.seen;
  seen.clear();
  if (dx === 0 && dy === 0) {
    _queryGridPoint(grid, ox, oy, out);
    return;
  }
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
// is dropped.
function _queryGridRegion(grid: UniformGrid, region: Readonly<SpatialAabb>, out: SpatialObjectId[]): void {
  out.length = 0;
  const cs = grid.cellSize;
  const seen = grid.seen;
  seen.clear();
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
}

// Reused scratch rectangles for the geometry overlap/containment helpers. Only ever read+written
// within a single non-nested helper call, so sharing them across the module allocates nothing per
// query without aliasing hazard.
const _scratchRectA: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
const _scratchRectB: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
