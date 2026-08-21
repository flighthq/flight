import type { SpatialAabb2D, SpatialObjectId, SpatialPair } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { setSpatialIndexingGuard } from './spatialIndexingGuard';
import { MAX_INDEXED_CELLS_PER_OBJECT, createUniformGridSpatialBackend2D } from './uniformGrid';

afterEach(() => {
  setSpatialIndexingGuard(null);
});

// A plain AABB-overlap confirmation used to turn broadphase candidate pairs into confirmed pairs (the
// narrow-phase stand-in): exactly the check the caller would apply downstream.
function boundsOverlap(a: Readonly<SpatialAabb2D>, b: Readonly<SpatialAabb2D>): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function pairKeys(pairs: readonly SpatialPair[]): string[] {
  return pairs.map((p) => `${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}`).sort();
}

function bruteForcePairKeys(
  objects: ReadonlyMap<SpatialObjectId, Readonly<SpatialAabb2D>>,
  cellSize: number,
): string[] {
  const entries = [...objects];
  const pairs: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aId, a] = entries[i];
      const [bId, b] = entries[j];
      if (
        isOverflowBounds(a, cellSize) || isOverflowBounds(b, cellSize)
          ? boundsOverlap(a, b)
          : boundsShareCell(a, b, cellSize)
      ) {
        pairs.push(`${Math.min(aId, bId)}-${Math.max(aId, bId)}`);
      }
    }
  }
  return pairs.sort();
}

function boundsContainPoint(bounds: Readonly<SpatialAabb2D>, x: number, y: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function boundsIntersectRay(bounds: Readonly<SpatialAabb2D>, ox: number, oy: number, dx: number, dy: number): boolean {
  let tMin = -Infinity;
  let tMax = Infinity;
  if (dx === 0) {
    if (ox < bounds.minX || ox > bounds.maxX) return false;
  } else {
    const tx0 = (bounds.minX - ox) / dx;
    const tx1 = (bounds.maxX - ox) / dx;
    tMin = Math.max(tMin, Math.min(tx0, tx1));
    tMax = Math.min(tMax, Math.max(tx0, tx1));
  }
  if (dy === 0) {
    if (oy < bounds.minY || oy > bounds.maxY) return false;
  } else {
    const ty0 = (bounds.minY - oy) / dy;
    const ty1 = (bounds.maxY - oy) / dy;
    tMin = Math.max(tMin, Math.min(ty0, ty1));
    tMax = Math.min(tMax, Math.max(ty0, ty1));
  }
  return tMax >= tMin && tMax >= 0;
}

function boundsShareCell(a: Readonly<SpatialAabb2D>, b: Readonly<SpatialAabb2D>, cellSize: number): boolean {
  return (
    Math.max(Math.floor(a.minX / cellSize), Math.floor(b.minX / cellSize)) <=
      Math.min(Math.floor(a.maxX / cellSize), Math.floor(b.maxX / cellSize)) &&
    Math.max(Math.floor(a.minY / cellSize), Math.floor(b.minY / cellSize)) <=
      Math.min(Math.floor(a.maxY / cellSize), Math.floor(b.maxY / cellSize))
  );
}

function createTestRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function isOverflowBounds(bounds: Readonly<SpatialAabb2D>, cellSize: number): boolean {
  const width = Math.floor(bounds.maxX / cellSize) - Math.floor(bounds.minX / cellSize) + 1;
  const height = Math.floor(bounds.maxY / cellSize) - Math.floor(bounds.minY / cellSize) + 1;
  return width * height > MAX_INDEXED_CELLS_PER_OBJECT;
}

function sortedIds(ids: readonly SpatialObjectId[]): SpatialObjectId[] {
  return [...ids].sort((a, b) => a - b);
}

describe('brute-force property coverage', () => {
  it('matches pair, region, point, and ray oracles through seeded cell and overflow churn', () => {
    const cellSize = 4;
    for (const seed of [0x1357_9bdf, 0x2468_ace0, 0x5eed_f00d, 0xc0ff_ee42]) {
      const random = createTestRandom(seed);
      const grid = createUniformGridSpatialBackend2D(cellSize);
      const objects = new Map<SpatialObjectId, SpatialAabb2D>();

      function randomBounds(overflow: boolean): SpatialAabb2D {
        const minX = Math.floor(random() * 160) - 80 + random();
        const minY = Math.floor(random() * 160) - 80 + random();
        const width = overflow ? cellSize * (34 + Math.floor(random() * 12)) : 0.25 + random() * 12;
        const height = overflow ? cellSize * (34 + Math.floor(random() * 12)) : 0.25 + random() * 12;
        return { minX, minY, maxX: minX + width, maxY: minY + height };
      }

      function expectMatchesBruteForce(label: string): void {
        const pairs: SpatialPair[] = [];
        grid.querySpatialPairs(pairs);
        expect(pairKeys(pairs), `${label}: pairs`).toEqual(bruteForcePairKeys(objects, cellSize));

        const regionMinX = random() * 240 - 120;
        const regionMinY = random() * 240 - 120;
        const region: SpatialAabb2D = {
          minX: regionMinX,
          minY: regionMinY,
          maxX: regionMinX + 1 + random() * 80,
          maxY: regionMinY + 1 + random() * 80,
        };
        const regionActual: SpatialObjectId[] = [];
        grid.querySpatialRegion(region, regionActual);
        const regionExpected = [...objects].filter(([, bounds]) => boundsOverlap(bounds, region)).map(([id]) => id);
        expect(sortedIds(regionActual), `${label}: region`).toEqual(sortedIds(regionExpected));

        const pointX = random() * 320 - 160;
        const pointY = random() * 320 - 160;
        const pointActual: SpatialObjectId[] = [];
        grid.querySpatialPoint(pointX, pointY, pointActual);
        const pointExpected = [...objects]
          .filter(([, bounds]) => boundsContainPoint(bounds, pointX, pointY))
          .map(([id]) => id);
        expect(sortedIds(pointActual), `${label}: point`).toEqual(sortedIds(pointExpected));

        const rayX = random() * 400 - 200;
        const rayY = random() * 400 - 200;
        let rayDx = random() * 2 - 1;
        let rayDy = random() * 2 - 1;
        if (random() < 0.1) rayDx = 0;
        if (random() < 0.1) rayDy = 0;
        const rayActual: SpatialObjectId[] = [];
        grid.querySpatialRay(rayX, rayY, rayDx, rayDy, rayActual);
        const rayExpected = [...objects]
          .filter(([, bounds]) => boundsIntersectRay(bounds, rayX, rayY, rayDx, rayDy))
          .map(([id]) => id);
        expect(sortedIds(rayActual), `${label}: ray`).toEqual(sortedIds(rayExpected));
      }

      const ordinary = randomBounds(false);
      objects.set(0, ordinary);
      grid.insertSpatialObject(0, ordinary);
      expectMatchesBruteForce(`seed ${seed}, ordinary`);

      const overflow = randomBounds(true);
      objects.set(0, overflow);
      grid.updateSpatialObject(0, overflow);
      expect(grid.explainSpatialIndexing(0).mode).toBe('overflow');
      expectMatchesBruteForce(`seed ${seed}, overflow`);

      const ordinaryAgain = randomBounds(false);
      objects.set(0, ordinaryAgain);
      grid.updateSpatialObject(0, ordinaryAgain);
      expect(grid.explainSpatialIndexing(0).mode).toBe('cells');
      expectMatchesBruteForce(`seed ${seed}, cells again`);

      for (let step = 0; step < 100; step++) {
        const id = Math.floor(random() * 18);
        if (random() < 0.72) {
          const bounds = randomBounds(random() < 0.22);
          if (objects.has(id)) grid.updateSpatialObject(id, bounds);
          else if (random() < 0.5) grid.insertSpatialObject(id, bounds);
          else grid.updateSpatialObject(id, bounds);
          objects.set(id, bounds);
        } else {
          grid.removeSpatialObject(id);
          objects.delete(id);
        }
        expectMatchesBruteForce(`seed ${seed}, step ${step}`);
      }
    }
  });
});

describe('cell range across every transition that can strand it', () => {
  // Chief's class-not-instance rule applied to the ray-hang defect. The bug was never "removal after
  // overflow"; it was that a separately-maintained `empty` flag could disagree with the cells it
  // described, and *every* transition that empties or re-seeds the cell set is a chance for that.
  // The fix derives the fact from `cells.size`, so no flag can drift — and these enumerate the
  // transitions so a future re-introduction is caught wherever it is introduced.
  //
  // Each case is asserted two ways: the ray returns the right ids, and it returns them without
  // walking a stale range. The second is the one that matters — the results were already correct
  // before the fix, and the whole defect was cost. Measured on this grid: a stranded range costs
  // ~70 ns per cell, so the 5,000,000-cell range used here took ~343 ms unstranded-vs-stranded
  // (1e12 as in the original report is hours, i.e. an uncatchable hang). Budget 150 ms leaves the
  // fixed path — an early return plus a one-object overflow scan, well under a millisecond — a
  // ~1500x margin, while still failing on a stranded range by ~2.3x.
  const FAR = 5_000_000;
  const RAY_BUDGET_MS = 150;

  // Correctness only. Used where the occupied cell range is legitimately wide, so the walk is
  // genuinely proportional to it — that is the documented conservative over-walk, not the defect.
  function rayIds(grid: ReturnType<typeof createUniformGridSpatialBackend2D>): SpatialObjectId[] {
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(-5, 0.5, 1, 0, out);
    return out.sort((a, b) => a - b);
  }

  // Correctness *and* the cost bound. Used only where the transition should have left the cell set
  // empty or tight, so any millions-of-cells walk means the range was stranded. Keeping these two
  // helpers apart is the point: a single budgeted helper made two honest cases fail, because their
  // titles claimed a seeding/removal property while the assertion silently demanded O(1).
  function rayIdsFast(grid: ReturnType<typeof createUniformGridSpatialBackend2D>): SpatialObjectId[] {
    const started = performance.now();
    const ids = rayIds(grid);
    expect(performance.now() - started).toBeLessThan(RAY_BUDGET_MS);
    return ids;
  }

  // Two small objects placed FAR apart, so any stranded range spans millions of cells.
  function gridWithWideRange(): ReturnType<typeof createUniformGridSpatialBackend2D> {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    grid.insertSpatialObject(2, { minX: FAR, minY: 0, maxX: FAR + 1, maxY: 1 });
    return grid;
  }

  it('seeds the range on the first celled insert and widens it on the next', () => {
    const grid = gridWithWideRange();
    expect(rayIds(grid)).toEqual([1, 2]);
  });

  it('removes the last celled object while an overflowed object remains', () => {
    // The reported case: overflow objects live in `bounds` but occupy no cells, so a flag derived
    // from `bounds.size` stayed false here and left the range stranded.
    const grid = gridWithWideRange();
    grid.insertSpatialObject(3, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.removeSpatialObject(1);
    grid.removeSpatialObject(2);
    expect(rayIdsFast(grid)).toEqual([3]);
  });

  it('removes the last celled object while a declined object remains', () => {
    const grid = gridWithWideRange();
    grid.insertSpatialObject(3, { minX: NaN, minY: 0, maxX: 1, maxY: 1 });
    grid.removeSpatialObject(1);
    grid.removeSpatialObject(2);
    expect(rayIdsFast(grid)).toEqual([]);
  });

  it('removes the last celled object with nothing else in the index', () => {
    const grid = gridWithWideRange();
    grid.removeSpatialObject(1);
    grid.removeSpatialObject(2);
    expect(rayIdsFast(grid)).toEqual([]);
  });

  it('removes an overflowed object while celled objects remain, keeping them findable', () => {
    const grid = gridWithWideRange();
    grid.insertSpatialObject(3, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.removeSpatialObject(3);
    expect(rayIds(grid)).toEqual([1, 2]);
  });

  it('updates the last celled object into overflow, emptying the cells', () => {
    // The overflow *transition* proper: no remove call, the object simply stops being celled.
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    grid.insertSpatialObject(2, { minX: FAR, minY: 0, maxX: FAR + 1, maxY: 1 });
    grid.updateSpatialObject(1, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.updateSpatialObject(2, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    expect(rayIdsFast(grid)).toEqual([1, 2]);
  });

  it('updates an overflowed object back into cells, re-seeding rather than widening', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    grid.insertSpatialObject(2, { minX: FAR, minY: 0, maxX: FAR + 1, maxY: 1 });
    grid.updateSpatialObject(1, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.updateSpatialObject(2, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    // Cells are empty here; coming back must seed a fresh tight range, not reuse the old wide one.
    grid.updateSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(rayIdsFast(grid)).toEqual([1, 2]);
  });

  it('clears while an overflowed object is present', () => {
    const grid = gridWithWideRange();
    grid.insertSpatialObject(3, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.clearSpatialIndex();
    expect(rayIdsFast(grid)).toEqual([]);
  });

  it('re-seeds a tight range after the index has been emptied and refilled', () => {
    const grid = gridWithWideRange();
    grid.clearSpatialIndex();
    grid.insertSpatialObject(9, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(rayIdsFast(grid)).toEqual([9]);
  });

  it('keeps region and point queries correct across the same overflow transition', () => {
    // The range is the ray's concern, but the transition must not corrupt the other queries either.
    const grid = gridWithWideRange();
    grid.insertSpatialObject(3, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.removeSpatialObject(1);
    grid.removeSpatialObject(2);
    const region: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1, minY: -1, maxX: 2, maxY: 2 }, region);
    expect(region).toEqual([3]);
    const point: SpatialObjectId[] = [];
    grid.querySpatialPoint(0.5, 0.5, point);
    expect(point).toEqual([3]);
  });
});

describe('createUniformGridSpatialBackend2D', () => {
  it('keeps region comparisons reentrant when a bounds getter starts a nested query', () => {
    const grid = createUniformGridSpatialBackend2D(0);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    grid.insertSpatialObject(2, { minX: 100, minY: 100, maxX: 101, maxY: 101 });
    let minXReads = 0;
    let nestedCalls = 0;
    const region: SpatialAabb2D = {
      get minX() {
        minXReads++;
        if (minXReads === 2) {
          nestedCalls++;
          grid.querySpatialRegion({ minX: -1, minY: -1, maxX: 200, maxY: 200 }, []);
        }
        return -1;
      },
      minY: -1,
      maxX: 2,
      maxY: 2,
    };
    const out: SpatialObjectId[] = [];

    grid.querySpatialRegion(region, out);

    expect(nestedCalls).toBe(1);
    expect(out).toEqual([1]);
  });

  it('emits a pair spanning several shared cells exactly once', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    // Both objects cover the same 3x3 block of cells (0..2, 0..2), so they co-occupy nine cells.
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 25, maxY: 25 });
    grid.insertSpatialObject(2, { minX: 5, minY: 5, maxX: 29, maxY: 29 });

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);

    expect(pairs).toHaveLength(1);
    expect(pairKeys(pairs)).toEqual(['1-2']);
  });

  it('never pairs an object with itself', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairs).toHaveLength(0);
  });

  it('returns nothing from every query on an empty grid', () => {
    const grid = createUniformGridSpatialBackend2D(10);

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairs).toHaveLength(0);

    const region: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -50, minY: -50, maxX: 50, maxY: 50 }, region);
    expect(region).toHaveLength(0);

    const point: SpatialObjectId[] = [];
    grid.querySpatialPoint(0, 0, point);
    expect(point).toHaveLength(0);

    const ray: SpatialObjectId[] = [];
    grid.querySpatialRay(0, 0, 1, 1, ray);
    expect(ray).toHaveLength(0);
  });

  it('indexes objects at negative coordinates', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: -8, minY: -8, maxX: -4, maxY: -4 });
    grid.insertSpatialObject(2, { minX: -6, minY: -6, maxX: -2, maxY: -2 });

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairKeys(pairs)).toEqual(['1-2']);

    const point: SpatialObjectId[] = [];
    grid.querySpatialPoint(-5, -5, point);
    expect(point.sort()).toEqual([1, 2]);
  });

  it('gives the same confirmed pairs across different cell sizes', () => {
    const objects: { id: SpatialObjectId; bounds: SpatialAabb2D }[] = [
      { id: 1, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { id: 2, bounds: { minX: 5, minY: 5, maxX: 15, maxY: 15 } },
      { id: 3, bounds: { minX: 12, minY: 12, maxX: 20, maxY: 20 } },
      { id: 4, bounds: { minX: 100, minY: 100, maxX: 110, maxY: 110 } },
    ];
    const boundsOf = new Map(objects.map((o) => [o.id, o.bounds]));

    function confirmedPairs(cellSize: number): string[] {
      const grid = createUniformGridSpatialBackend2D(cellSize);
      for (const o of objects) grid.insertSpatialObject(o.id, o.bounds);
      const candidates: SpatialPair[] = [];
      grid.querySpatialPairs(candidates);
      const confirmed = candidates.filter((p) => boundsOverlap(boundsOf.get(p.a)!, boundsOf.get(p.b)!));
      return pairKeys(confirmed);
    }

    const fine = confirmedPairs(10);
    const coarse = confirmedPairs(64);

    expect(fine).toEqual(['1-2', '2-3']);
    expect(coarse).toEqual(fine);
  });
});

describe('MAX_INDEXED_CELLS_PER_OBJECT', () => {
  it('is the per-object cell budget the oversized path is chosen by', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    // A square block of exactly the budget stays on the ordinary path; one cell more does not. The
    // budget is a count of cells, not an extent, so it is asserted through the count.
    const side = Math.sqrt(MAX_INDEXED_CELLS_PER_OBJECT);
    expect(Number.isInteger(side)).toBe(true);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: side - 1, maxY: side - 1 });
    expect(grid.explainSpatialIndexing(1)).toEqual({
      bucketCount: MAX_INDEXED_CELLS_PER_OBJECT,
      id: 1,
      mode: 'cells',
      reason: null,
    });

    grid.insertSpatialObject(2, { minX: 0, minY: 0, maxX: side, maxY: side - 1 });
    expect(grid.explainSpatialIndexing(2).mode).toBe('overflow');
  });
});

describe('non-finite bounds', () => {
  it('declines rather than indexing, and answers with the false sentinel', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    expect(grid.insertSpatialObject(1, { minX: NaN, minY: 0, maxX: 10, maxY: 10 })).toBe(false);
    expect(grid.insertSpatialObject(2, { minX: 0, minY: 0, maxX: Infinity, maxY: 10 })).toBe(false);
    expect(grid.insertSpatialObject(3, { minX: 0, minY: -Infinity, maxX: 10, maxY: 10 })).toBe(false);
    expect(grid.explainSpatialIndexing(1)).toEqual({
      bucketCount: 0,
      id: 1,
      mode: 'declined',
      reason: 'non-finite-bounds',
    });
  });

  it('returns true for finite bounds, so the sentinel distinguishes decline from success', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    expect(grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true);
  });

  it('keeps a declined object out of every query rather than out of some', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: NaN, minY: NaN, maxX: NaN, maxY: NaN });
    grid.insertSpatialObject(2, { minX: 0, minY: 0, maxX: 10, maxY: 10 });

    const region: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 }, region);
    expect(region).toEqual([2]);

    const point: SpatialObjectId[] = [];
    grid.querySpatialPoint(5, 5, point);
    expect(point).toEqual([2]);

    const ray: SpatialObjectId[] = [];
    grid.querySpatialRay(-5, 5, 1, 0, ray);
    expect(ray).toEqual([2]);

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairs).toEqual([]);
  });

  it('drops an object that updates to non-finite bounds instead of stranding it at its old ones', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(grid.updateSpatialObject(1, { minX: NaN, minY: NaN, maxX: NaN, maxY: NaN })).toBe(false);
    expect(grid.explainSpatialIndexing(1).mode).toBe('declined');
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(5, 5, out);
    expect(out).toEqual([]);
  });

  it('lets a declined object recover on a later finite update', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: NaN, minY: NaN, maxX: NaN, maxY: NaN });
    expect(grid.updateSpatialObject(1, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true);
    expect(grid.explainSpatialIndexing(1).mode).toBe('cells');
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(5, 5, out);
    expect(out).toEqual([1]);
  });
});

describe('oversized region query', () => {
  // The same unbounded-walk hazard from the caller's side: the region is caller-supplied, so a query
  // wider than the world would walk extent-squared cells against a grid holding almost nothing.
  // Measured at 69 ms for a 1000x1000-cell region over a one-object grid before the bound.
  it('answers a region far wider than the grid without walking it cell by cell', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    const out: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 }, out);
    expect(out).toEqual([1]);
  });

  it('returns the same objects either way it walks', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    for (let i = 0; i < 40; i++) grid.insertSpatialObject(i, { minX: i, minY: 0, maxX: i + 0.5, maxY: 1 });
    const wide: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 }, wide);
    const narrow: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1, minY: -1, maxX: 41, maxY: 2 }, narrow);
    expect([...wide].sort((a, b) => a - b)).toEqual([...narrow].sort((a, b) => a - b));
    expect(wide.length).toBe(40);
  });

  it('still excludes objects the wide region misses', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    grid.insertSpatialObject(2, { minX: 5e11, minY: 0, maxX: 5e11 + 1, maxY: 1 });
    const out: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: -1e12, minY: -1e12, maxX: 10, maxY: 1e12 }, out);
    expect(out).toEqual([1]);
  });
});

describe('oversized-extent bound', () => {
  // THE REGRESSION GUARD for the unbounded insert walk.
  //
  // The extent here is deliberately modest — 200 units at one cell per unit, so 40,401 cells, which
  // an unbounded build writes in about 28 ms. That is the point: this assertion FAILS on unbounded
  // code rather than HANGING it, so it stays a usable test. A realistic reproduction (an AABB 1e12
  // wide, which is what a diverging rigid-body simulation actually produces) would be 1e24 cells and
  // would never return, which is exactly why the bound cannot be tested at its motivating scale.
  it('holds an oversized object without writing a cell per unit of its extent', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 200, maxY: 200 });
    const explanation = grid.explainSpatialIndexing(1);
    expect(explanation.mode).toBe('overflow');
    expect(explanation.bucketCount).toBe(0);
  });

  it('indexes an AABB far past any walkable extent in constant time', () => {
    // Unreachable for an unbounded build (1e24 cells), so this one cannot be written as a
    // before/after assertion — it is the proof that the motivating case is now O(1). Safe to run only
    // because the assertion above fails first if the bound is ever removed.
    const grid = createUniformGridSpatialBackend2D(1);
    expect(grid.insertSpatialObject(1, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 })).toBe(true);
    expect(grid.explainSpatialIndexing(1).mode).toBe('overflow');
  });

  it('keeps an oversized object queryable — the bound is a cost decision, not a dropped object', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.insertSpatialObject(2, { minX: 0, minY: 0, maxX: 1, maxY: 1 });

    const region: SpatialObjectId[] = [];
    grid.querySpatialRegion({ minX: 100, minY: 100, maxX: 101, maxY: 101 }, region);
    expect(region).toEqual([1]);

    const point: SpatialObjectId[] = [];
    grid.querySpatialPoint(500, 500, point);
    expect(point).toEqual([1]);

    const ray: SpatialObjectId[] = [];
    grid.querySpatialRay(1e6, 1e6, 1, 0, ray);
    expect(ray).toEqual([1]);

    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairKeys(pairs)).toEqual(['1-2']);
  });

  it('emits each overflow pair once, including overflow against overflow', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 });
    grid.insertSpatialObject(2, { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 });
    grid.insertSpatialObject(3, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairKeys(pairs)).toEqual(['1-2', '1-3', '2-3']);
  });

  it('does not pair an overflow object with a disjoint object', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 100000, maxY: 100000 });
    grid.insertSpatialObject(2, { minX: -50, minY: -50, maxX: -40, maxY: -40 });
    const pairs: SpatialPair[] = [];
    grid.querySpatialPairs(pairs);
    expect(pairs).toEqual([]);
  });

  it('removes an oversized object without walking its extent, and stops returning it', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.removeSpatialObject(1);
    expect(grid.explainSpatialIndexing(1).mode).toBe('absent');
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(0, 0, out);
    expect(out).toEqual([]);
  });

  it('moves an object between the celled and overflow paths as it grows and shrinks', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    expect(grid.explainSpatialIndexing(1).mode).toBe('cells');
    grid.updateSpatialObject(1, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    expect(grid.explainSpatialIndexing(1).mode).toBe('overflow');
    grid.updateSpatialObject(1, { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    expect(grid.explainSpatialIndexing(1).mode).toBe('cells');

    // Back on the ordinary path the object must be findable through the cells again, not stranded.
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(1, 1, out);
    expect(out).toEqual([1]);
  });

  it('clears overflow with the rest of the index', () => {
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    grid.clearSpatialIndex();
    expect(grid.explainSpatialIndexing(1).mode).toBe('absent');
    const out: SpatialObjectId[] = [];
    grid.querySpatialPoint(0, 0, out);
    expect(out).toEqual([]);
  });

  it('keeps an oversized object out of the ray-traversal cell range', () => {
    // Without the bound the occupied cell range stretches to the oversized object's span, and every
    // subsequent ray walks it. Two small objects far apart bound the range; the oversized one must
    // not widen it, which shows up as the ray still resolving correctly and promptly.
    const grid = createUniformGridSpatialBackend2D(1);
    grid.insertSpatialObject(1, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    grid.insertSpatialObject(2, { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(-5, 0.5, 1, 0, out);
    expect(out.sort()).toEqual([1, 2]);
  });
});

describe('ray edge cases', () => {
  it('finds objects along a ray that passes exactly through cell corners', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: 10, minY: 10, maxX: 12, maxY: 12 });
    grid.insertSpatialObject(2, { minX: 20, minY: 20, maxX: 22, maxY: 22 });
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(-5, -5, 1, 1, out);
    expect(sortedIds(out)).toEqual([1, 2]);
  });

  it('finds an object when the ray starts inside its bounds', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: 5, minY: 5, maxX: 15, maxY: 15 });
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(10, 10, -1, 0, out);
    expect(out).toEqual([1]);
  });

  it('clips a ray entering the occupied range from far outside', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: 100, minY: 30, maxX: 110, maxY: 40 });
    const out: SpatialObjectId[] = [];
    grid.querySpatialRay(-1e9, 35, 1, 0, out);
    expect(out).toEqual([1]);
  });
});

describe('updateSpatialObject2D', () => {
  it('refreshes exact bounds without retaining the caller object when the covered cells stay unchanged', () => {
    const grid = createUniformGridSpatialBackend2D(10);
    grid.insertSpatialObject(1, { minX: 1, minY: 1, maxX: 18, maxY: 18 });
    const updated = { minX: 4, minY: 4, maxX: 19, maxY: 19 };

    expect(grid.updateSpatialObject(1, updated)).toBe(true);
    updated.minX = -100;
    updated.minY = -100;
    updated.maxX = 100;
    updated.maxY = 100;

    const oldPoint: SpatialObjectId[] = [];
    grid.querySpatialPoint(2, 2, oldPoint);
    expect(oldPoint).toEqual([]);
    const newPoint: SpatialObjectId[] = [];
    grid.querySpatialPoint(5, 5, newPoint);
    expect(newPoint).toEqual([1]);
  });
});
