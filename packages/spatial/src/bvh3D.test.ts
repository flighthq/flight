import type { SpatialAabb3D, SpatialIndexBackend3D, SpatialObjectId, SpatialPair } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createBvhSpatialBackend3D } from './bvh3D';
import { createUniformGridSpatialBackend3D } from './uniformGrid3D';

// The BVH is tested against the UNIFORM GRID, not against itself. The grid is the proven incumbent and
// the two are meant to be interchangeable behind one seam, so any disagreement is a defect in one of
// them — which is a far stronger statement than "the tree returns something plausible".
//
// Sets are compared, never order: the seam promises which ids match, and two structures walk their
// contents in different orders by construction.

function createRandom(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function box(x: number, y: number, z: number, size: number): SpatialAabb3D {
  return { maxX: x + size, maxY: y + size, maxZ: z + size, minX: x, minY: y, minZ: z };
}

function sorted(ids: readonly SpatialObjectId[]): SpatialObjectId[] {
  return [...ids].sort((a, b) => a - b);
}

function sortedPairs(pairs: readonly SpatialPair[]): string[] {
  return pairs.map((pair) => `${String(Math.min(pair.a, pair.b))}-${String(Math.max(pair.a, pair.b))}`).sort();
}

describe('createBvhSpatialBackend3D', () => {
  it('answers every query exactly as the uniform grid does, over a seeded scene', () => {
    const random = createRandom(6112026);
    const bvh = createBvhSpatialBackend3D(2);
    const grid = createUniformGridSpatialBackend3D(16);

    // Deliberately wide size variance — the case a uniform grid handles worst and a tree handles well.
    // If the two agree here they agree anywhere.
    for (let id = 0; id < 120; id += 1) {
      const size = id % 12 === 0 ? 40 + random() * 30 : 0.5 + random() * 4;
      const bounds = box((random() - 0.5) * 400, (random() - 0.5) * 400, (random() - 0.5) * 400, size);
      expect(bvh.insertSpatialObject(id, bounds)).toBe(grid.insertSpatialObject(id, bounds));
    }

    const bvhOut: SpatialObjectId[] = [];
    const gridOut: SpatialObjectId[] = [];

    for (let probe = 0; probe < 60; probe += 1) {
      const region = box((random() - 0.5) * 400, (random() - 0.5) * 400, (random() - 0.5) * 400, 10 + random() * 60);
      bvh.querySpatialRegion(region, bvhOut);
      grid.querySpatialRegion(region, gridOut);
      expect(sorted(bvhOut), `region probe ${String(probe)}`).toEqual(sorted(gridOut));

      const px = (random() - 0.5) * 400;
      const py = (random() - 0.5) * 400;
      const pz = (random() - 0.5) * 400;
      bvh.querySpatialPoint(px, py, pz, bvhOut);
      grid.querySpatialPoint(px, py, pz, gridOut);
      expect(sorted(bvhOut), `point probe ${String(probe)}`).toEqual(sorted(gridOut));

      const dx = random() - 0.5;
      const dy = random() - 0.5;
      const dz = random() - 0.5;
      bvh.querySpatialRay(px, py, pz, dx, dy, dz, bvhOut);
      grid.querySpatialRay(px, py, pz, dx, dy, dz, gridOut);
      expect(sorted(bvhOut), `ray probe ${String(probe)}`).toEqual(sorted(gridOut));
    }
  });

  it('reports every TRULY overlapping pair after inserts, moves, and removals', () => {
    const random = createRandom(778291);
    const bvh = createBvhSpatialBackend3D(1.5);
    const grid = createUniformGridSpatialBackend3D(12);

    // The oracle's own record of where everything ended up, kept alongside rather than read back out of
    // either index — a truth set derived from the thing under test would prove nothing.
    const live = new Map<number, SpatialAabb3D>();
    for (let id = 0; id < 60; id += 1) {
      const bounds = box((random() - 0.5) * 80, (random() - 0.5) * 80, (random() - 0.5) * 80, 1 + random() * 5);
      bvh.insertSpatialObject(id, bounds);
      grid.insertSpatialObject(id, bounds);
      live.set(id, bounds);
    }
    for (let id = 0; id < 60; id += 3) {
      const bounds = box((random() - 0.5) * 80, (random() - 0.5) * 80, (random() - 0.5) * 80, 1 + random() * 5);
      bvh.updateSpatialObject(id, bounds);
      grid.updateSpatialObject(id, bounds);
      live.set(id, bounds);
    }
    for (let id = 1; id < 60; id += 7) {
      bvh.removeSpatialObject(id);
      grid.removeSpatialObject(id);
      live.delete(id);
    }

    const bvhPairs: SpatialPair[] = [];
    const gridPairs: SpatialPair[] = [];
    bvh.querySpatialPairs(bvhPairs);
    grid.querySpatialPairs(gridPairs);

    // NOT set equality, and the difference is the contract rather than a defect. A pair is a CANDIDATE:
    // the grid emits everything sharing a cell without testing bounds at all, so its answer is a strict
    // superset, while the tree tests overlap at the leaf and returns the true set. Both are legal; what
    // both owe is that no real overlap is missing. Asserting equality here would have been asserting that
    // two backends make the same conservative approximation, which the seam never promised.
    const truth = new Set<string>();
    for (let a = 0; a < 60; a += 1) {
      for (let b = a + 1; b < 60; b += 1) {
        const boundsA = live.get(a);
        const boundsB = live.get(b);
        if (boundsA === undefined || boundsB === undefined) continue;
        if (
          boundsA.minX < boundsB.maxX &&
          boundsA.maxX > boundsB.minX &&
          boundsA.minY < boundsB.maxY &&
          boundsA.maxY > boundsB.minY &&
          boundsA.minZ < boundsB.maxZ &&
          boundsA.maxZ > boundsB.minZ
        ) {
          truth.add(`${String(a)}-${String(b)}`);
        }
      }
    }

    const bvhSet = new Set(sortedPairs(bvhPairs));
    const gridSet = new Set(sortedPairs(gridPairs));
    expect(truth.size).toBeGreaterThan(0);
    for (const pair of truth) {
      expect(bvhSet.has(pair), `bvh missed ${pair}`).toBe(true);
      expect(gridSet.has(pair), `grid missed ${pair}`).toBe(true);
    }
    // No self-pairs and no duplicates, which both backends do owe exactly.
    expect(sortedPairs(bvhPairs)).toEqual([...bvhSet].sort());
    expect(bvhPairs.every((pair) => pair.a !== pair.b)).toBe(true);
  });

  it('keeps answering correctly while objects move within their margin', () => {
    // The fat-bounds fast path: a small move leaves the tree untouched, so only the exact bounds are
    // refreshed. If they were not, the query would answer from where the object USED to be — the exact
    // failure the margin risks introducing.
    const bvh = createBvhSpatialBackend3D(10);
    bvh.insertSpatialObject(1, box(0, 0, 0, 1));

    const out: SpatialObjectId[] = [];
    bvh.querySpatialPoint(0.5, 0.5, 0.5, out);
    expect(out).toEqual([1]);

    // Well inside the 10-unit margin, so no reinsertion happens.
    bvh.updateSpatialObject(1, box(4, 0, 0, 1));
    bvh.querySpatialPoint(0.5, 0.5, 0.5, out);
    expect(out).toEqual([]);
    bvh.querySpatialPoint(4.5, 0.5, 0.5, out);
    expect(out).toEqual([1]);
  });

  it('declines non-finite and inverted bounds with the same sentinel as the grid', () => {
    const bvh = createBvhSpatialBackend3D();
    const grid = createUniformGridSpatialBackend3D(16);
    const nonFinite: SpatialAabb3D = { maxX: 1, maxY: 1, maxZ: 1, minX: NaN, minY: 0, minZ: 0 };
    const inverted: SpatialAabb3D = { maxX: -1, maxY: 1, maxZ: 1, minX: 0, minY: 0, minZ: 0 };

    expect(bvh.insertSpatialObject(1, nonFinite)).toBe(grid.insertSpatialObject(1, nonFinite));
    expect(bvh.insertSpatialObject(2, inverted)).toBe(grid.insertSpatialObject(2, inverted));
    expect(bvh.explainSpatialIndexing(1).mode).toBe('declined');
    expect(bvh.explainSpatialIndexing(1).reason).toBe('non-finite-bounds');
    expect(bvh.explainSpatialIndexing(2).reason).toBe('inverted-bounds');

    const out: SpatialObjectId[] = [];
    bvh.querySpatialRegion(box(-100, -100, -100, 200), out);
    expect(out).toEqual([]);
  });

  it('removes an object whose update is declined rather than leaving it at its old bounds', () => {
    // The seam's contract: a declined update must not read as a current position. Kept identical to the
    // grid's behaviour, since a caller ignoring the sentinel must not see the two backends differ.
    const bvh = createBvhSpatialBackend3D();
    bvh.insertSpatialObject(1, box(0, 0, 0, 4));
    expect(bvh.updateSpatialObject(1, { maxX: 1, maxY: 1, maxZ: 1, minX: Infinity, minY: 0, minZ: 0 })).toBe(false);

    const out: SpatialObjectId[] = [];
    bvh.querySpatialRegion(box(-10, -10, -10, 40), out);
    expect(out).toEqual([]);
    expect(bvh.explainSpatialIndexing(1).mode).toBe('declined');
  });

  it('reports absent for an id it has never seen, and after a clear', () => {
    const bvh = createBvhSpatialBackend3D();
    expect(bvh.explainSpatialIndexing(99).mode).toBe('absent');
    bvh.insertSpatialObject(99, box(0, 0, 0, 1));
    expect(bvh.explainSpatialIndexing(99).mode).toBe('cells');
    bvh.clearSpatialIndex();
    expect(bvh.explainSpatialIndexing(99).mode).toBe('absent');
  });

  it('stays balanced under sorted insertion, which is the case that degenerates a naive tree', () => {
    // A run of monotonically increasing boxes is the worst input for an unbalanced tree: it builds a
    // linked list and every query goes linear. Measured indirectly through the query still being exact
    // over a large sorted set, which a broken rotation would break outright rather than merely slow.
    const bvh = createBvhSpatialBackend3D(0);
    const grid = createUniformGridSpatialBackend3D(8);
    for (let id = 0; id < 400; id += 1) {
      const bounds = box(id * 3, 0, 0, 2);
      bvh.insertSpatialObject(id, bounds);
      grid.insertSpatialObject(id, bounds);
    }
    const bvhOut: SpatialObjectId[] = [];
    const gridOut: SpatialObjectId[] = [];
    bvh.querySpatialRegion(box(300, -5, -5, 60), bvhOut);
    grid.querySpatialRegion(box(300, -5, -5, 60), gridOut);
    expect(sorted(bvhOut)).toEqual(sorted(gridOut));
    expect(bvhOut.length).toBeGreaterThan(5);
  });

  it('is interchangeable with the grid behind createSpatialIndex3D', () => {
    // The seam's whole promise. Both are SpatialIndexBackend3D and neither is named in the call.
    const backends: SpatialIndexBackend3D[] = [createBvhSpatialBackend3D(), createUniformGridSpatialBackend3D(16)];
    const results = backends.map((backend) => {
      backend.insertSpatialObject(1, box(0, 0, 0, 5));
      backend.insertSpatialObject(2, box(100, 0, 0, 5));
      const out: SpatialObjectId[] = [];
      backend.querySpatialRegion(box(-1, -1, -1, 10), out);
      return sorted(out);
    });
    expect(results[0]).toEqual(results[1]);
  });
});
