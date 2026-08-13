import type { PackableRectangle, PackedRectangle, RectangleId } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { BIN_PACK_DEFAULT_MAX_EXTENT, getPackResultOccupancy, packRectangles } from './packRectangles';

describe('BIN_PACK_DEFAULT_MAX_EXTENT', () => {
  it('is the cap the packer actually applies when the caller names none', () => {
    // A rectangle one unit past the default must not fit; one exactly at it must.
    expect(packRectangles([{ id: 'over', width: BIN_PACK_DEFAULT_MAX_EXTENT + 1, height: 4 }]).unpacked).toEqual([
      'over',
    ]);
    expect(packRectangles([{ id: 'at', width: BIN_PACK_DEFAULT_MAX_EXTENT, height: 4 }]).unpacked).toEqual([]);
  });
});

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function rectanglesOverlap(a: Readonly<PackedRectangle>, b: Readonly<PackedRectangle>): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

describe('getPackResultOccupancy', () => {
  it('reports covered fraction of the REPORTED extent, so rounding waste is visible', () => {
    const exact = packRectangles([{ id: 'a', width: 16, height: 16 }]);
    expect(getPackResultOccupancy(exact)).toBe(1);
    // powerOfTwo rounds 24 up to 32, and the occupancy must show that as waste rather than hide it.
    const rounded = packRectangles([{ id: 'a', width: 24, height: 24 }], { powerOfTwo: true });
    expect(rounded.width).toBe(32);
    expect(getPackResultOccupancy(rounded)).toBeCloseTo((24 * 24) / (32 * 32), 10);
  });

  it('returns 0 rather than NaN for an empty result, since nothing-packed is expected', () => {
    const empty = packRectangles([]);
    expect(empty.width * empty.height).toBe(0);
    expect(getPackResultOccupancy(empty)).toBe(0);
  });
});

describe('packRectangles', () => {
  it('places ~20 varied rectangles with no pairwise overlap, inside the bin, at their input size', () => {
    const rects: PackableRectangle[] = [];
    for (let i = 0; i < 20; i++) {
      rects.push({ id: i, width: 8 + ((i * 7) % 40), height: 6 + ((i * 13) % 34) });
    }

    const result = packRectangles(rects, { padding: 1, border: 2 });
    expect(result.unpacked).toEqual([]);
    expect(result.placements).toHaveLength(20);

    const sizeById = new Map(rects.map((rect) => [rect.id, rect] as const));
    for (const placement of result.placements) {
      const input = sizeById.get(placement.id)!;
      const expectedWidth = placement.rotated ? input.height : input.width;
      const expectedHeight = placement.rotated ? input.width : input.height;
      expect(placement.width).toBe(expectedWidth);
      expect(placement.height).toBe(expectedHeight);

      expect(placement.x).toBeGreaterThanOrEqual(2);
      expect(placement.y).toBeGreaterThanOrEqual(2);
      expect(placement.x + placement.width).toBeLessThanOrEqual(result.width - 2);
      expect(placement.y + placement.height).toBeLessThanOrEqual(result.height - 2);
    }

    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(rectanglesOverlap(result.placements[i], result.placements[j])).toBe(false);
      }
    }
  });

  it('leaves nothing unpacked when everything fits in a growable bin', () => {
    const rects: PackableRectangle[] = [
      { id: 'a', width: 30, height: 20 },
      { id: 'b', width: 40, height: 40 },
      { id: 'c', width: 10, height: 60 },
      { id: 'd', width: 25, height: 25 },
      { id: 'e', width: 50, height: 15 },
    ];

    const result = packRectangles(rects);
    expect(result.unpacked).toEqual([]);
    expect(result.placements).toHaveLength(5);
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(rectanglesOverlap(result.placements[i], result.placements[j])).toBe(false);
      }
    }
  });

  it('reports overflow ids in a fixed bin and keeps the placed rectangles non-overlapping', () => {
    const rects: PackableRectangle[] = [];
    for (let i = 0; i < 12; i++) {
      rects.push({ id: i, width: 20, height: 20 });
    }

    const result = packRectangles(rects, { growable: false, maxWidth: 44, maxHeight: 44 });
    expect(result.unpacked.length).toBeGreaterThan(0);
    expect(result.placements.length + result.unpacked.length).toBe(12);
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(rectanglesOverlap(result.placements[i], result.placements[j])).toBe(false);
      }
    }
  });

  it('respects padding between neighbors and border at the bin edge', () => {
    const rects: PackableRectangle[] = [
      { id: 'a', width: 10, height: 10 },
      { id: 'b', width: 10, height: 10 },
    ];

    const result = packRectangles(rects, { padding: 2, border: 4 });
    expect(result.unpacked).toEqual([]);

    const a = result.placements.find((p) => p.id === 'a')!;
    const b = result.placements.find((p) => p.id === 'b')!;
    expect(a).toEqual({ id: 'a', x: 4, y: 4, width: 10, height: 10, rotated: false });
    expect(b).toEqual({ id: 'b', x: 16, y: 4, width: 10, height: 10, rotated: false });

    // Gap between the two neighbors is exactly the padding.
    expect(b.x - (a.x + a.width)).toBe(2);
    // Every placement is at least `border` from every bin edge.
    for (const placement of result.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(4);
      expect(placement.y).toBeGreaterThanOrEqual(4);
      expect(placement.x + placement.width).toBeLessThanOrEqual(result.width - 4);
      expect(placement.y + placement.height).toBeLessThanOrEqual(result.height - 4);
    }
  });

  it('reports power-of-two and square extents that still contain every placement', () => {
    const rects: PackableRectangle[] = [
      { id: 'a', width: 30, height: 20 },
      { id: 'b', width: 17, height: 41 },
      { id: 'c', width: 25, height: 9 },
    ];

    const result = packRectangles(rects, { powerOfTwo: true, square: true });
    expect(isPowerOfTwo(result.width)).toBe(true);
    expect(isPowerOfTwo(result.height)).toBe(true);
    expect(result.width).toBe(result.height);

    for (const placement of result.placements) {
      expect(placement.x + placement.width).toBeLessThanOrEqual(result.width);
      expect(placement.y + placement.height).toBeLessThanOrEqual(result.height);
    }
  });

  it('rotates a rectangle when rotation is required to fit a fixed bin', () => {
    const rects: PackableRectangle[] = [{ id: 'tall', width: 8, height: 20 }];
    const options = { growable: false as const, maxWidth: 20, maxHeight: 8 };

    const withRotation = packRectangles(rects, { ...options, allowRotation: true });
    expect(withRotation.unpacked).toEqual([]);
    expect(withRotation.placements).toHaveLength(1);
    const placed = withRotation.placements[0];
    expect(placed.rotated).toBe(true);
    expect(placed.width).toBe(20);
    expect(placed.height).toBe(8);

    const withoutRotation = packRectangles(rects, { ...options, allowRotation: false });
    expect(withoutRotation.placements).toEqual([]);
    expect(withoutRotation.unpacked).toEqual(['tall']);
  });

  it('grows to fit a rectangle that would need rotation in a fixed bin', () => {
    const rects: PackableRectangle[] = [{ id: 'tall', width: 8, height: 20 }];
    const result = packRectangles(rects, { allowRotation: false });
    expect(result.unpacked).toEqual([]);
    expect(result.placements[0].rotated).toBe(false);
    expect(result.placements[0].width).toBe(8);
    expect(result.placements[0].height).toBe(20);
  });

  it('produces a deep-equal result for the same input packed twice', () => {
    const rects: PackableRectangle[] = [];
    for (let i = 0; i < 15; i++) {
      rects.push({ id: `r${i}`, width: 5 + ((i * 11) % 30), height: 5 + ((i * 17) % 28) });
    }
    const options = { padding: 1, border: 3, allowRotation: true };

    const first = packRectangles(rects, options);
    const second = packRectangles(rects, options);
    expect(second).toEqual(first);
  });

  it('returns an empty result with a zero-size bin for empty input', () => {
    const result = packRectangles([]);
    expect(result).toEqual({ placements: [], width: 0, height: 0, unpacked: [] });
  });

  it('packs a single rectangle at the border corner', () => {
    const result = packRectangles([{ id: 'only', width: 12, height: 7 }], { border: 3 });
    expect(result.unpacked).toEqual([]);
    expect(result.placements).toEqual([{ id: 'only', x: 3, y: 3, width: 12, height: 7, rotated: false }]);
    expect(result.width).toBe(18);
    expect(result.height).toBe(13);
  });

  it('reports a rectangle larger than a fixed bin as unpacked', () => {
    const result = packRectangles([{ id: 'big', width: 500, height: 500 }], {
      growable: false,
      maxWidth: 64,
      maxHeight: 64,
    });
    expect(result.placements).toEqual([]);
    expect(result.unpacked).toEqual(['big']);
  });

  it('reports a rectangle larger than the growth cap as unpacked', () => {
    const result = packRectangles([{ id: 'huge', width: 200, height: 10 }], { maxWidth: 64, maxHeight: 64 });
    expect(result.unpacked).toEqual(['huge']);
  });
});

describe('packRectangles edge cases', () => {
  it('rejects zero and negative dimensions to unpacked rather than placing a degenerate rect', () => {
    const result = packRectangles([
      { id: 'zeroW', width: 0, height: 10 },
      { id: 'zeroH', width: 10, height: 0 },
      { id: 'negative', width: -8, height: 10 },
      { id: 'ok', width: 10, height: 10 },
    ]);
    expect(result.placements.map((p) => p.id)).toEqual(['ok']);
    expect([...result.unpacked].sort()).toEqual(['negative', 'zeroH', 'zeroW']);
  });

  it('treats duplicate ids as distinct rectangles, placing both without overlap', () => {
    const result = packRectangles([
      { id: 'same', width: 10, height: 10 },
      { id: 'same', width: 10, height: 10 },
    ]);
    expect(result.placements).toHaveLength(2);
    const [a, b] = result.placements;
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });

  it('places non-integer sizes without rounding them', () => {
    const result = packRectangles([{ id: 'frac', width: 10.5, height: 4.25 }]);
    expect(result.placements[0]).toMatchObject({ width: 10.5, height: 4.25 });
  });

  it('sends everything to unpacked when border collapses the usable region', () => {
    const result = packRectangles([{ id: 'a', width: 4, height: 4 }], {
      maxWidth: 10,
      maxHeight: 10,
      border: 6, // 2*6 = 12 > 10, so there is no usable region at all
      growable: false,
    });
    expect(result.placements).toEqual([]);
    expect(result.unpacked).toEqual(['a']);
  });

  it('keeps padding larger than the pieces from overlapping them', () => {
    const result = packRectangles(
      [
        { id: 'a', width: 2, height: 2 },
        { id: 'b', width: 2, height: 2 },
      ],
      { padding: 20 },
    );
    expect(result.placements).toHaveLength(2);
    const [a, b] = result.placements;
    const gapX = Math.abs(a.x - b.x) >= 2 + 20;
    const gapY = Math.abs(a.y - b.y) >= 2 + 20;
    expect(gapX || gapY).toBe(true);
  });
});

describe('packRectangles properties', () => {
  // Deterministic LCG: seeded so a failure is reproducible from the seed alone, and no Math.random —
  // which the portability gate forbids and which would make a red run unreproducible anyway.
  function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  it('holds its invariants across 40 seeded inputs and both heuristics', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = makeRandom(seed);
      const count = 1 + Math.floor(random() * 25);
      const rects: PackableRectangle[] = [];
      for (let i = 0; i < count; i++) {
        rects.push({ id: i, width: 1 + Math.floor(random() * 60), height: 1 + Math.floor(random() * 60) });
      }
      const padding = Math.floor(random() * 4);
      const border = Math.floor(random() * 4);
      const heuristic = seed % 2 === 0 ? 'bestAreaFit' : 'bestShortSideFit';
      const options = { padding, border, heuristic, allowRotation: seed % 3 === 0 } as const;

      const result = packRectangles(rects, options);
      const label = `seed ${seed} (${heuristic})`;

      // Every input is accounted for exactly once — BY IDENTITY, not by count. A count is satisfied by
      // placing one piece twice and losing another, which is the corruption this package can actually
      // produce and the one that reaches an atlas as two sprites sharing pixels.
      expect(result.placements.length + result.unpacked.length, label).toBe(rects.length);
      expect(countIds([...result.placements.map((placement) => placement.id), ...result.unpacked]), label).toEqual(
        countIds(rects.map((rect) => rect.id)),
      );

      // Every placement carries ITS OWN size, swapped exactly when it says it was turned. A packer that
      // reports `rotated` without swapping places correctly and describes the placement wrongly, and the
      // overlap and bounds assertions below both pass for it.
      const sizes = new Map<number, { height: number; width: number }>();
      for (const rect of rects) sizes.set(rect.id as number, { height: rect.height, width: rect.width });
      for (const placement of result.placements) {
        const source = sizes.get(placement.id as number)!;
        const expected = placement.rotated
          ? { height: source.width, width: source.height }
          : { height: source.height, width: source.width };
        expect({ height: placement.height, width: placement.width }, `${label}: ${String(placement.id)}`).toEqual(
          expected,
        );
      }

      // The occupancy helper must describe the placements it is derived from, not a stale or parallel
      // accounting of them.
      const placedArea = result.placements.reduce((total, placement) => total + placement.width * placement.height, 0);
      const reportedArea = result.width * result.height;
      expect(getPackResultOccupancy(result), label).toBeCloseTo(reportedArea > 0 ? placedArea / reportedArea : 0, 12);

      for (const placement of result.placements) {
        // Inside the bin, honouring the border on every side.
        expect(placement.x >= border, label).toBe(true);
        expect(placement.y >= border, label).toBe(true);
        expect(placement.x + placement.width <= result.width - border, label).toBe(true);
        expect(placement.y + placement.height <= result.height - border, label).toBe(true);
      }

      // Pairwise non-overlap, with padding respected as a real gap.
      for (let i = 0; i < result.placements.length; i++) {
        for (let j = i + 1; j < result.placements.length; j++) {
          const a = result.placements[i];
          const b = result.placements[j];
          const apart =
            a.x + a.width + padding <= b.x ||
            b.x + b.width + padding <= a.x ||
            a.y + a.height + padding <= b.y ||
            b.y + b.height + padding <= a.y;
          expect(apart, `${label}: ${String(a.id)} vs ${String(b.id)}`).toBe(true);
        }
      }

      // Deterministic: the same input re-packs identically.
      expect(packRectangles(rects, options), label).toEqual(result);
    }
  });
});

function countIds(ids: readonly RectangleId[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of ids) counts[String(id)] = (counts[String(id)] ?? 0) + 1;
  return counts;
}
