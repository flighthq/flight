import type { RectangleId } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainUnpackedRectangles } from './explainUnpackedRectangles';
import { packRectangles } from './packRectangles';

describe('explainUnpackedRectangles', () => {
  it('returns nothing when everything was placed', () => {
    expect(explainUnpackedRectangles([{ id: 'a', width: 8, height: 8 }])).toEqual([]);
  });

  it('separates oversized from binExhausted, which have different remedies', () => {
    // 'huge' can never fit any bin within the caps; 'filler' fits in principle and loses the race.
    const explanations = explainUnpackedRectangles(
      [
        { id: 'huge', width: 500, height: 10 },
        { id: 'filler', width: 90, height: 90 },
        { id: 'filler2', width: 90, height: 90 },
      ],
      { maxWidth: 100, maxHeight: 100, growable: false },
    );
    const byId = new Map(explanations.map((e) => [e.id, e.reason]));
    expect(byId.get('huge')).toBe('oversized');
    expect(byId.get('filler2')).toBe('binExhausted');
  });

  it('blames the collapsed region rather than the pieces when border eats the caps', () => {
    // Every piece fails for ONE reason here; calling each 'oversized' would send the caller after the
    // rectangles instead of after the border.
    const explanations = explainUnpackedRectangles(
      [
        { id: 'a', width: 2, height: 2 },
        { id: 'b', width: 2, height: 2 },
      ],
      { maxWidth: 10, maxHeight: 10, border: 6, growable: false },
    );
    expect(explanations.map((e) => e.reason)).toEqual(['regionCollapsed', 'regionCollapsed']);
    expect(explanations[0].usableWidth).toBeLessThanOrEqual(0);
  });

  it('counts rotation as a real second chance before calling a piece oversized', () => {
    const rects = [{ id: 'tall', width: 10, height: 200 }];
    const options = { maxWidth: 300, maxHeight: 100, growable: false } as const;
    expect(explainUnpackedRectangles(rects, options)[0].reason).toBe('oversized');
    // Rotated it is 200x10, which fits inside 300x100 — so it is not oversized, it merely lost.
    expect(explainUnpackedRectangles(rects, { ...options, allowRotation: true })).toEqual([]);
  });

  it('reports the usable extent it measured against, net of border', () => {
    const [explanation] = explainUnpackedRectangles([{ id: 'a', width: 999, height: 4 }], {
      maxWidth: 100,
      maxHeight: 100,
      border: 5,
      growable: false,
    });
    expect(explanation).toMatchObject({ id: 'a', usableWidth: 90, usableHeight: 90 });
  });
});

describe('explainUnpackedRectangles cross-checked against packRectangles', () => {
  // The two functions must agree about the same input: an explanation per failure, no more and no less.
  // They can disagree because they identify pieces differently — the packer treats two rectangles sharing
  // an id as DISTINCT and reports bare ids, so a membership test cannot tell one failure from two.
  it('returns exactly one entry per unpacked piece when two rectangles share an id', () => {
    const rectangles = [
      { id: 'a', width: 60, height: 60 },
      { id: 'a', width: 60, height: 60 },
    ];
    const options = { growable: false, maxHeight: 64, maxWidth: 64 } as const;

    const result = packRectangles(rectangles, options);
    // One of the pair fits and the other does not, which is the case a set-based match gets wrong.
    expect(result.placements).toHaveLength(1);
    expect(result.unpacked).toEqual(['a']);

    expect(explainUnpackedRectangles(rectangles, options)).toHaveLength(1);
  });

  it('returns one entry per failure when BOTH duplicates fail', () => {
    const rectangles = [
      { id: 'a', width: 500, height: 500 },
      { id: 'a', width: 500, height: 500 },
    ];
    const options = { growable: false, maxHeight: 64, maxWidth: 64 } as const;

    expect(packRectangles(rectangles, options).unpacked).toEqual(['a', 'a']);
    expect(explainUnpackedRectangles(rectangles, options)).toHaveLength(2);
  });

  it('agrees with packRectangles across seeded inputs, counting ids rather than assuming uniqueness', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const random = makeRandom(seed);
      const count = 1 + Math.floor(random() * 12);
      const rectangles = Array.from({ length: count }, (_, index) => ({
        // Ids collide on purpose: half the seeds draw from a pool smaller than the rectangle count, so
        // duplicate ids are the common case here rather than the exotic one.
        id: seed % 2 === 0 ? `id-${index % 3}` : `id-${index}`,
        width: 1 + Math.floor(random() * 80),
        height: 1 + Math.floor(random() * 80),
      }));
      const options = { growable: false, maxHeight: 96, maxWidth: 96 } as const;
      const label = `seed ${seed}`;

      const unpacked = packRectangles(rectangles, options).unpacked;
      const explained = explainUnpackedRectangles(rectangles, options);

      expect(explained.length, label).toBe(unpacked.length);
      expect(countById(explained.map((entry) => entry.id)), label).toEqual(countById(unpacked));
    }
  });
});

function countById(ids: readonly RectangleId[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of ids) counts[String(id)] = (counts[String(id)] ?? 0) + 1;
  return counts;
}

// A small deterministic PRNG, so a failure names a seed a reader can re-run rather than a shape that
// vanishes on the next run.
function makeRandom(seed: number): () => number {
  let state = seed * 1103515245 + 12345;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
