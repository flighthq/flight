// Generated from crates/flight-binpack/tests/pack_rectangles_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  BIN_PACK_DEFAULT_MAX_EXTENT,
  getBinPackHeuristicString,
  getPackResultOccupancy,
  packRectangles,
  parseBinPackHeuristic,
} from './contract.ts';
import type { BinPackOptions, PackableRectangle, PackedRectangle, RectangleId } from './contract.ts';

interface Random {
  state: number;
}

function isPowerOfTwo(value: number): boolean {
  const v = value | 0;
  return v > 0 && (v & (v - 1)) === 0;
}

function rectanglesOverlap(a: Readonly<PackedRectangle>, b: Readonly<PackedRectangle>): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function countId(ids: Readonly<RectangleId[]>, target: Readonly<RectangleId>): number {
  let count = 0;
  for (const id of ids) {
    if (id === target) {
      count += 1;
    }
  }
  return count;
}

function sameIdCounts(a: Readonly<RectangleId[]>, b: Readonly<RectangleId[]>): boolean {
  for (const id of a) {
    if (countId(a, id) !== countId(b, id)) {
      return false;
    }
  }
  for (const id of b) {
    if (countId(a, id) !== countId(b, id)) {
      return false;
    }
  }
  return true;
}

function makeRandom(seed: number): Random {
  return { state: seed };
}

function nextRandom(rng: Random): number {
  rng.state = ((Math.imul(rng.state, 1664525) >>> 0) + 1013904223) >>> 0;
  return rng.state / 4294967296.0;
}

describe('getBinPackHeuristicString', () => {
  it('returns the exact ts strings', () => {
    expect(getBinPackHeuristicString('bestShortSideFit')).toEqual('bestShortSideFit');
    expect(getBinPackHeuristicString('bestAreaFit')).toEqual('bestAreaFit');
  });
});

describe('getPackResultOccupancy', () => {
  it('reports covered fraction of the reported extent so rounding waste is visible', () => {
    const exact = packRectangles([{ id: 'a', width: 16.0, height: 16.0 }], undefined);
    expect(getPackResultOccupancy(exact)).toEqual(1.0);
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.powerOfTwo = true;
    const rounded = packRectangles([{ id: 'a', width: 24.0, height: 24.0 }], options);
    expect(rounded.width).toEqual(32.0);
    const expectedOccupancy = (24.0 * 24.0) / (32.0 * 32.0);
    const actualOccupancy = getPackResultOccupancy(rounded);
    const diff = Math.abs(actualOccupancy - expectedOccupancy);
    expect(diff < 0.5e-10, `expected ${expectedOccupancy}, got ${actualOccupancy} (diff: ${diff})`).toBe(true);
  });
  it('returns zero rather than nan for an empty result since nothing packed is expected', () => {
    const empty = packRectangles([], undefined);
    expect(empty.width * empty.height).toEqual(0.0);
    expect(getPackResultOccupancy(empty)).toEqual(0.0);
  });
});

describe('packRectangles', () => {
  it('bin pack default max extent is the cap the packer actually applies when the caller names none', () => {
    const over = packRectangles([{ id: 'over', width: BIN_PACK_DEFAULT_MAX_EXTENT + 1.0, height: 4.0 }], undefined);
    expect(over.unpacked).toEqual(['over']);
    const at = packRectangles([{ id: 'at', width: BIN_PACK_DEFAULT_MAX_EXTENT, height: 4.0 }], undefined);
    expect(at.unpacked.length === 0).toBe(true);
  });
  it('places varied rectangles with no pairwise overlap inside the bin at their input size', () => {
    let rects: PackableRectangle[] = [] as never[];
    for (let i = 0; i < 20; i += 1) {
      rects.push({ id: i, width: 8.0 + ((i * 7) % 40), height: 6.0 + ((i * 13) % 34) });
    }
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.padding = 1.0;
    options.border = 2.0;
    const result = packRectangles(rects, options);
    expect(result.unpacked.length === 0).toBe(true);
    expect(result.placements.length).toEqual(20);
    const placements: Readonly<PackedRectangle[]> = result.placements;
    for (const placement of placements) {
      let inputW = 0.0;
      let inputH = 0.0;
      for (const rect of rects) {
        if (rect.id === placement.id) {
          inputW = rect.width;
          inputH = rect.height;
        }
      }
      const expectedWidth = placement.rotated ? inputH : inputW;
      const expectedHeight = placement.rotated ? inputW : inputH;
      expect(placement.width).toEqual(expectedWidth);
      expect(placement.height).toEqual(expectedHeight);
      expect(placement.x >= 2.0).toBe(true);
      expect(placement.y >= 2.0).toBe(true);
      expect(placement.x + placement.width <= result.width - 2.0).toBe(true);
      expect(placement.y + placement.height <= result.height - 2.0).toBe(true);
    }
    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        expect(!rectanglesOverlap(result.placements[i], result.placements[j]), `placements ${i} and ${j} overlap`).toBe(
          true,
        );
      }
    }
  });
  it('leaves nothing unpacked when everything fits in a growable bin', () => {
    const rects = [
      { id: 'a', width: 30.0, height: 20.0 },
      { id: 'b', width: 40.0, height: 40.0 },
      { id: 'c', width: 10.0, height: 60.0 },
      { id: 'd', width: 25.0, height: 25.0 },
      { id: 'e', width: 50.0, height: 15.0 },
    ];
    const result = packRectangles(rects, undefined);
    expect(result.unpacked.length === 0).toBe(true);
    expect(result.placements.length).toEqual(5);
    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        expect(!rectanglesOverlap(result.placements[i], result.placements[j])).toBe(true);
      }
    }
  });
  it('reports overflow ids in a fixed bin and keeps the placed rectangles non overlapping', () => {
    let rects: PackableRectangle[] = [] as never[];
    for (let i = 0; i < 12; i += 1) {
      rects.push({ id: i, width: 20.0, height: 20.0 });
    }
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.growable = false;
    options.maxWidth = 44.0;
    options.maxHeight = 44.0;
    const result = packRectangles(rects, options);
    expect(result.unpacked.length > 0).toBe(true);
    expect(result.placements.length + result.unpacked.length).toEqual(12);
    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        expect(!rectanglesOverlap(result.placements[i], result.placements[j])).toBe(true);
      }
    }
  });
  it('respects padding between neighbors and border at the bin edge', () => {
    const rects = [
      { id: 'a', width: 10.0, height: 10.0 },
      { id: 'b', width: 10.0, height: 10.0 },
    ];
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.padding = 2.0;
    options.border = 4.0;
    const result = packRectangles(rects, options);
    expect(result.unpacked.length === 0).toBe(true);
    let placements: Readonly<PackedRectangle[]> = result.placements;
    const a = placements.find((p) => p.id === 'a')!;
    const b = placements.find((p) => p.id === 'b')!;
    expect(a).toEqual({ id: 'a', x: 4.0, y: 4.0, width: 10.0, height: 10.0, rotated: false });
    expect(b).toEqual({ id: 'b', x: 16.0, y: 4.0, width: 10.0, height: 10.0, rotated: false });
    expect(b.x - (a.x + a.width)).toEqual(2.0);
    placements = result.placements;
    for (const placement of placements) {
      expect(placement.x >= 4.0).toBe(true);
      expect(placement.y >= 4.0).toBe(true);
      expect(placement.x + placement.width <= result.width - 4.0).toBe(true);
      expect(placement.y + placement.height <= result.height - 4.0).toBe(true);
    }
  });
  it('reports power of two and square extents that still contain every placement', () => {
    const rects = [
      { id: 'a', width: 30.0, height: 20.0 },
      { id: 'b', width: 17.0, height: 41.0 },
      { id: 'c', width: 25.0, height: 9.0 },
    ];
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.powerOfTwo = true;
    options.square = true;
    const result = packRectangles(rects, options);
    expect(isPowerOfTwo(result.width)).toBe(true);
    expect(isPowerOfTwo(result.height)).toBe(true);
    expect(result.width).toEqual(result.height);
    const placements: Readonly<PackedRectangle[]> = result.placements;
    for (const placement of placements) {
      expect(placement.x + placement.width <= result.width).toBe(true);
      expect(placement.y + placement.height <= result.height).toBe(true);
    }
  });
  it('rotates a rectangle when rotation is required to fit a fixed bin', () => {
    const rects = [{ id: 'tall', width: 8.0, height: 20.0 }];
    let optionsWith: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    optionsWith.growable = false;
    optionsWith.maxWidth = 20.0;
    optionsWith.maxHeight = 8.0;
    optionsWith.allowRotation = true;
    const withRotation = packRectangles(rects, optionsWith);
    expect(withRotation.unpacked.length === 0).toBe(true);
    expect(withRotation.placements.length).toEqual(1);
    const placed = withRotation.placements[0];
    expect(placed.rotated).toEqual(true);
    expect(placed.width).toEqual(20.0);
    expect(placed.height).toEqual(8.0);
    let optionsWithout: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    optionsWithout.growable = false;
    optionsWithout.maxWidth = 20.0;
    optionsWithout.maxHeight = 8.0;
    optionsWithout.allowRotation = false;
    const withoutRotation = packRectangles(rects, optionsWithout);
    expect(withoutRotation.placements.length === 0).toBe(true);
    expect(withoutRotation.unpacked).toEqual(['tall']);
  });
  it('grows to fit a rectangle that would need rotation in a fixed bin', () => {
    const rects = [{ id: 'tall', width: 8.0, height: 20.0 }];
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.allowRotation = false;
    const result = packRectangles(rects, options);
    expect(result.unpacked.length === 0).toBe(true);
    expect(result.placements[0].rotated).toEqual(false);
    expect(result.placements[0].width).toEqual(8.0);
    expect(result.placements[0].height).toEqual(20.0);
  });
  it('produces a deep equal result for the same input packed twice', () => {
    let rects: PackableRectangle[] = [] as never[];
    for (let i = 0; i < 15; i += 1) {
      rects.push({ id: `r${i}`, width: 5.0 + ((i * 11) % 30), height: 5.0 + ((i * 17) % 28) });
    }
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.padding = 1.0;
    options.border = 3.0;
    options.allowRotation = true;
    const first = packRectangles(rects, options);
    const second = packRectangles(rects, options);
    expect(second).toEqual(first);
  });
  it('returns an empty result with a zero size bin for empty input', () => {
    const result = packRectangles([], undefined);
    expect(result.placements.length).toEqual(0);
    expect(result.width).toEqual(0.0);
    expect(result.height).toEqual(0.0);
    expect(result.unpacked.length).toEqual(0);
  });
  it('packs a single rectangle at the border corner', () => {
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.border = 3.0;
    const result = packRectangles([{ id: 'only', width: 12.0, height: 7.0 }], options);
    expect(result.unpacked.length === 0).toBe(true);
    expect(result.placements.length).toEqual(1);
    expect(result.placements[0]).toEqual({ id: 'only', x: 3.0, y: 3.0, width: 12.0, height: 7.0, rotated: false });
    expect(result.width).toEqual(18.0);
    expect(result.height).toEqual(13.0);
  });
  it('reports a rectangle larger than a fixed bin as unpacked', () => {
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.growable = false;
    options.maxWidth = 64.0;
    options.maxHeight = 64.0;
    const result = packRectangles([{ id: 'big', width: 500.0, height: 500.0 }], options);
    expect(result.placements.length === 0).toBe(true);
    expect(result.unpacked).toEqual(['big']);
  });
  it('reports a rectangle larger than the growth cap as unpacked', () => {
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.maxWidth = 64.0;
    options.maxHeight = 64.0;
    const result = packRectangles([{ id: 'huge', width: 200.0, height: 10.0 }], options);
    expect(result.unpacked).toEqual(['huge']);
  });
  it('rejects zero and negative dimensions to unpacked rather than placing a degenerate rect', () => {
    const rects = [
      { id: 'zeroW', width: 0.0, height: 10.0 },
      { id: 'zeroH', width: 10.0, height: 0.0 },
      { id: 'negative', width: -8.0, height: 10.0 },
      { id: 'ok', width: 10.0, height: 10.0 },
    ];
    const result = packRectangles(rects, undefined);
    expect(result.placements.length).toEqual(1);
    expect(result.placements[0].id).toEqual('ok');
    expect(sameIdCounts(result.unpacked, ['negative', 'zeroH', 'zeroW'])).toBe(true);
  });
  it('round trips negative numeric ids through placements and unpacked', () => {
    const rects = [
      { id: -7, width: 10.0, height: 10.0 },
      { id: -2, width: 10.0, height: 10.0 },
    ];
    const result = packRectangles(rects, undefined);
    let ids: number[] = [] as never[];
    const placements: Readonly<PackedRectangle[]> = result.placements;
    for (const placement of placements) {
      {
        const matchValue = placement.id;
        if (typeof matchValue === 'number') {
          const id = matchValue;
          ids.push(id);
        } else if (typeof matchValue === 'string') {
        }
      }
    }
    ids.sort((a, b) => a - b);
    expect(ids).toEqual([-7, -2]);
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.growable = false;
    options.maxWidth = 5.0;
    options.maxHeight = 5.0;
    const fixed = packRectangles([{ id: -9, width: 20.0, height: 20.0 }], options);
    expect(fixed.unpacked).toEqual([-9]);
  });
  it('treats duplicate ids as distinct rectangles placing both without overlap', () => {
    const rects = [
      { id: 'same', width: 10.0, height: 10.0 },
      { id: 'same', width: 10.0, height: 10.0 },
    ];
    const result = packRectangles(rects, undefined);
    expect(result.placements.length).toEqual(2);
    const a = result.placements[0];
    const b = result.placements[1];
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });
  it('places non integer sizes without rounding them', () => {
    const result = packRectangles([{ id: 'frac', width: 10.5, height: 4.25 }], undefined);
    expect(result.placements[0].width).toEqual(10.5);
    expect(result.placements[0].height).toEqual(4.25);
  });
  it('sends everything to unpacked when border collapses the usable region', () => {
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.maxWidth = 10.0;
    options.maxHeight = 10.0;
    options.border = 6.0;
    options.growable = false;
    const result = packRectangles([{ id: 'a', width: 4.0, height: 4.0 }], options);
    expect(result.placements.length === 0).toBe(true);
    expect(result.unpacked).toEqual(['a']);
  });
  it('keeps padding larger than the pieces from overlapping them', () => {
    let options: BinPackOptions = {
      padding: 0.0,
      border: 0.0,
      allowRotation: false,
      heuristic: 'bestShortSideFit',
      growable: true,
      powerOfTwo: false,
      square: false,
      maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
      maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
    options.padding = 20.0;
    const rects = [
      { id: 'a', width: 2.0, height: 2.0 },
      { id: 'b', width: 2.0, height: 2.0 },
    ];
    const result = packRectangles(rects, options);
    expect(result.placements.length).toEqual(2);
    const a = result.placements[0];
    const b = result.placements[1];
    const gapX = Math.abs(a.x - b.x) >= 2.0 + 20.0;
    const gapY = Math.abs(a.y - b.y) >= 2.0 + 20.0;
    expect(gapX || gapY).toBe(true);
  });
  it('holds its invariants across 40 seeded inputs and both heuristics', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      let rng = makeRandom(seed >>> 0);
      const count = 1 + (Math.floor(nextRandom(rng) * 25.0) | 0);
      let rects: PackableRectangle[] = [] as never[];
      for (let i = 0; i < count; i += 1) {
        const id = seed % 5 === 0 ? i % 3 : i;
        let size = makeRandom((seed * 1000 + id) >>> 0);
        rects.push({
          id: id,
          width: 1.0 + Math.floor(nextRandom(size) * 60.0),
          height: 1.0 + Math.floor(nextRandom(size) * 60.0),
        });
      }
      const padding = Math.floor(nextRandom(rng) * 4.0);
      const border = Math.floor(nextRandom(rng) * 4.0);
      const heuristic = seed % 2 === 0 ? 'bestAreaFit' : ('bestShortSideFit' as const);
      let options: BinPackOptions = {
        padding: 0.0,
        border: 0.0,
        allowRotation: false,
        heuristic: 'bestShortSideFit',
        growable: true,
        powerOfTwo: false,
        square: false,
        maxWidth: BIN_PACK_DEFAULT_MAX_EXTENT,
        maxHeight: BIN_PACK_DEFAULT_MAX_EXTENT,
      };
      options.padding = padding;
      options.border = border;
      options.heuristic = heuristic;
      options.allowRotation = seed % 3 === 0;
      const result = packRectangles(rects, options);
      const label = `seed ${seed} (${getBinPackHeuristicString(heuristic)})`;
      expect(result.placements.length + result.unpacked.length, `${label}`).toEqual(rects.length);
      let placements: Readonly<PackedRectangle[]> = result.placements;
      let resultIds: RectangleId[] = [] as never[];
      for (const p of placements) {
        resultIds.push(p.id);
      }
      for (const u of result.unpacked) {
        resultIds.push(u);
      }
      const inputIds: RectangleId[] = rects.map((r) => r.id);
      expect(sameIdCounts(resultIds, inputIds), `${label}`).toBe(true);
      for (const placement of placements) {
        let numericId = 0;
        {
          const matchValue = placement.id;
          if (typeof matchValue === 'number') {
            const n = matchValue;
            numericId = n;
          } else if (typeof matchValue === 'string') {
          }
        }
        let sourceWidth = 0.0;
        let sourceHeight = 0.0;
        for (const rect of rects) {
          if (rect.id === placement.id) {
            sourceWidth = rect.width;
            sourceHeight = rect.height;
          }
        }
        const [expectedWidth, expectedHeight] = placement.rotated
          ? [sourceHeight, sourceWidth]
          : [sourceWidth, sourceHeight];
        expect(placement.width, `${label}: ${numericId}`).toEqual(expectedWidth);
        expect(placement.height, `${label}: ${numericId}`).toEqual(expectedHeight);
      }
      const placedArea: number = placements.map((p) => p.width * p.height).reduce((sum, value) => sum + value, 0);
      const reportedArea = result.width * result.height;
      const expectedOccupancy = reportedArea > 0.0 ? placedArea / reportedArea : 0.0;
      const actualOccupancy = getPackResultOccupancy(result);
      const diff = Math.abs(actualOccupancy - expectedOccupancy);
      expect(
        diff < 0.5e-12,
        `${label}: occupancy mismatch: expected ${expectedOccupancy}, got ${actualOccupancy} (diff: ${diff})`,
      ).toBe(true);
      placements = result.placements;
      for (const placement of placements) {
        expect(placement.x >= border, `${label}: x ${placement.x} < border ${border}`).toBe(true);
        expect(placement.y >= border, `${label}: y ${placement.y} < border ${border}`).toBe(true);
        expect(
          placement.x + placement.width <= result.width - border,
          `${label}: right ${placement.x + placement.width} > width - border ${result.width - border}`,
        ).toBe(true);
        expect(
          placement.y + placement.height <= result.height - border,
          `${label}: bottom ${placement.y + placement.height} > height - border ${result.height - border}`,
        ).toBe(true);
      }
      for (let i = 0; i < result.placements.length; i += 1) {
        for (let j = i + 1; j < result.placements.length; j += 1) {
          const a = result.placements[i];
          const b = result.placements[j];
          const apart =
            a.x + a.width + padding <= b.x ||
            b.x + b.width + padding <= a.x ||
            a.y + a.height + padding <= b.y ||
            b.y + b.height + padding <= a.y;
          expect(apart, `${label}: ${a.id} vs ${b.id} overlap with padding`).toBe(true);
        }
      }
      const deterministic = packRectangles(rects, options);
      expect(deterministic, `${label}`).toEqual(result);
    }
  });
});

describe('parseBinPackHeuristic', () => {
  it('parses the exact ts strings', () => {
    expect(parseBinPackHeuristic('bestShortSideFit')).toEqual('bestShortSideFit');
    expect(parseBinPackHeuristic('bestAreaFit')).toEqual('bestAreaFit');
  });
  it('rejects other text and wrong casing', () => {
    expect(parseBinPackHeuristic('bestshortsidefit')).toEqual(undefined);
    expect(parseBinPackHeuristic('BestAreaFit')).toEqual(undefined);
    expect(parseBinPackHeuristic('')).toEqual(undefined);
  });
});
