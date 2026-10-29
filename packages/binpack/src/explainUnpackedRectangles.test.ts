// Generated from crates/flight-binpack/tests/explain_unpacked_rectangles_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  BIN_PACK_DEFAULT_MAX_EXTENT,
  explainUnpackedRectangles,
  getUnpackedRectangleReasonString,
  packRectangles,
  parseUnpackedRectangleReason,
} from './contract.ts';
import type {
  BinPackOptions,
  PackableRectangle,
  RectangleId,
  UnpackedRectangleExplanation,
  UnpackedRectangleReason,
} from './contract.ts';

interface Random {
  state: number;
}

function explain(
  rectangles: Readonly<PackableRectangle[]>,
  options: Readonly<BinPackOptions> | undefined,
): UnpackedRectangleExplanation[] {
  let out = [] as never[];
  explainUnpackedRectangles(out, rectangles, options);
  return out;
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

function reasonForId(
  explanations: Readonly<UnpackedRectangleExplanation[]>,
  target: Readonly<RectangleId>,
): UnpackedRectangleReason | undefined {
  for (const explanation of explanations) {
    if (explanation.id === target) {
      return explanation.reason;
    }
  }
  return undefined;
}

function makeRandom(seed: number): Random {
  const state = (seed * 1103515245 + 12345) % 2147483648;
  return { state: state };
}

function nextRandom(rng: Random): number {
  rng.state = (rng.state * 1103515245 + 12345) % 2147483648;
  return rng.state / 2147483648.0;
}

describe('explainUnpackedRectangles', () => {
  it('clears a reused out and keeps its capacity', () => {
    const rectangle: PackableRectangle = { id: 'a', width: 8.0, height: 8.0 };
    let out: UnpackedRectangleExplanation[] = [] as never[];
    out.push({ id: 'stale', reason: 'oversized', usableWidth: 0.0, usableHeight: 0.0 });
    explainUnpackedRectangles(out, [rectangle], undefined);
    expect(out.length === 0).toBe(true);
  });
  it('returns nothing when everything was placed', () => {
    const result = explain([{ id: 'a', width: 8.0, height: 8.0 }], undefined);
    expect(result.length === 0).toBe(true);
  });
  it('separates oversized from bin exhausted which have different remedies', () => {
    const rects = [
      { id: 'huge', width: 500.0, height: 10.0 },
      { id: 'filler', width: 90.0, height: 90.0 },
      { id: 'filler2', width: 90.0, height: 90.0 },
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
    options.maxWidth = 100.0;
    options.maxHeight = 100.0;
    options.growable = false;
    const explanations = explain(rects, options);
    expect(reasonForId(explanations, 'huge')).toEqual('oversized');
    expect(reasonForId(explanations, 'filler2')).toEqual('binExhausted');
  });
  it('blames the collapsed region rather than the pieces when border eats the caps', () => {
    const rects = [
      { id: 'a', width: 2.0, height: 2.0 },
      { id: 'b', width: 2.0, height: 2.0 },
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
    options.maxWidth = 10.0;
    options.maxHeight = 10.0;
    options.border = 6.0;
    options.growable = false;
    const explanations = explain(rects, options);
    const reasons: UnpackedRectangleReason[] = explanations.map((e) => e.reason);
    expect(reasons).toEqual(['regionCollapsed', 'regionCollapsed']);
    expect(explanations[0].usableWidth <= 0.0).toBe(true);
  });
  it('counts rotation as a real second chance before calling a piece oversized', () => {
    const rects = [{ id: 'tall', width: 10.0, height: 200.0 }];
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
    options.maxWidth = 300.0;
    options.maxHeight = 100.0;
    options.growable = false;
    const withoutRotation = explain(rects, options);
    expect(withoutRotation[0].reason).toEqual('oversized');
    let optionsRotated: BinPackOptions = {
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
    optionsRotated.maxWidth = 300.0;
    optionsRotated.maxHeight = 100.0;
    optionsRotated.growable = false;
    optionsRotated.allowRotation = true;
    const withRotation = explain(rects, optionsRotated);
    expect(withRotation.length === 0).toBe(true);
  });
  it('reports the usable extent it measured against net of border', () => {
    const rects = [{ id: 'a', width: 999.0, height: 4.0 }];
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
    options.maxWidth = 100.0;
    options.maxHeight = 100.0;
    options.border = 5.0;
    options.growable = false;
    const explanations = explain(rects, options);
    expect(explanations[0].id).toEqual('a');
    expect(explanations[0].usableWidth).toEqual(90.0);
    expect(explanations[0].usableHeight).toEqual(90.0);
  });
  it('returns exactly one entry per unpacked piece when two rectangles share an id', () => {
    const rects = [
      { id: 'a', width: 60.0, height: 60.0 },
      { id: 'a', width: 60.0, height: 60.0 },
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
    options.growable = false;
    options.maxHeight = 64.0;
    options.maxWidth = 64.0;
    const result = packRectangles(rects, options);
    expect(result.placements.length).toEqual(1);
    expect(result.unpacked).toEqual(['a']);
    const explanations = explain(rects, options);
    expect(explanations.length).toEqual(1);
  });
  it('returns one entry per failure when both duplicates fail', () => {
    const rects = [
      { id: 'a', width: 500.0, height: 500.0 },
      { id: 'a', width: 500.0, height: 500.0 },
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
    options.growable = false;
    options.maxHeight = 64.0;
    options.maxWidth = 64.0;
    const result = packRectangles(rects, options);
    expect(result.unpacked).toEqual(['a', 'a']);
    const explanations = explain(rects, options);
    expect(explanations.length).toEqual(2);
  });
  it('agrees with pack rectangles across seeded inputs counting ids rather than assuming uniqueness', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      let rng = makeRandom(seed);
      const count = 1 + (Math.floor(nextRandom(rng) * 12.0) | 0);
      let rects: PackableRectangle[] = [] as never[];
      for (let index = 0; index < count; index += 1) {
        const idStr = seed % 2 === 0 ? `id-${index % 3}` : `id-${index}`;
        rects.push({
          id: idStr,
          width: 1.0 + Math.floor(nextRandom(rng) * 80.0),
          height: 1.0 + Math.floor(nextRandom(rng) * 80.0),
        });
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
      options.maxHeight = 96.0;
      options.maxWidth = 96.0;
      const label = `seed ${seed}`;
      const unpacked = packRectangles(rects, options).unpacked;
      const explained = explain(rects, options);
      expect(explained.length, `${label}`).toEqual(unpacked.length);
      const explainedIds: RectangleId[] = explained.map((e) => e.id);
      expect(sameIdCounts(explainedIds, unpacked), `${label}`).toBe(true);
    }
  });
});

describe('getUnpackedRectangleReasonString', () => {
  it('returns the exact ts strings', () => {
    expect(getUnpackedRectangleReasonString('oversized')).toEqual('oversized');
    expect(getUnpackedRectangleReasonString('regionCollapsed')).toEqual('regionCollapsed');
    expect(getUnpackedRectangleReasonString('binExhausted')).toEqual('binExhausted');
  });
});

describe('parseUnpackedRectangleReason', () => {
  it('parses the exact ts strings', () => {
    expect(parseUnpackedRectangleReason('oversized')).toEqual('oversized');
    expect(parseUnpackedRectangleReason('regionCollapsed')).toEqual('regionCollapsed');
    expect(parseUnpackedRectangleReason('binExhausted')).toEqual('binExhausted');
  });
  it('rejects other text and wrong casing', () => {
    expect(parseUnpackedRectangleReason('Oversized')).toEqual(undefined);
    expect(parseUnpackedRectangleReason('binexhausted')).toEqual(undefined);
    expect(parseUnpackedRectangleReason('')).toEqual(undefined);
  });
});
