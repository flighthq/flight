import type { EasingFunction } from '@flighthq/types/contract';

// Cross-family invariants: relationships BETWEEN the In/Out/InOut siblings, which is where this package's
// real defects live. A per-curve value assertion is close to blind here — `easeInQuadratic(0.5) === 0.25`
// also accepts curves that are not easeInQuadratic, and every easing function satisfies f(0)=0 and f(1)=1,
// so endpoint assertions accept nearly everything. In ten families of near-identical arithmetic the likely
// defect is a copy-paste between neighbours, and only a relationship between siblings can see it.
//
// This file is cross-family by construction, which is why it has no single source sibling: each assertion
// is about a PAIR or the whole set. Per-curve behaviour stays in each family's own test file.
import {
  easeInBack,
  easeInBounce,
  easeInCircular,
  easeInCubic,
  easeInElastic,
  easeInExponential,
  easeInOutBack,
  easeInOutBounce,
  easeInOutCircular,
  easeInOutCubic,
  easeInOutElastic,
  easeInOutExponential,
  easeInOutQuadratic,
  easeInOutQuartic,
  easeInOutQuintic,
  easeInOutSine,
  easeInQuadratic,
  easeInQuartic,
  easeInQuintic,
  easeInSine,
  easeOutBack,
  easeOutBounce,
  easeOutCircular,
  easeOutCubic,
  easeOutElastic,
  easeOutExponential,
  easeOutQuadratic,
  easeOutQuartic,
  easeOutQuintic,
  easeOutSine,
} from './contract';

interface Family {
  easeIn: EasingFunction;
  easeInOut: EasingFunction;
  easeOut: EasingFunction;
  // Whether easeInOut is the two halves of easeIn/easeOut scaled into place. FALSE for the two families
  // whose canonical definition gives the InOut variant a DIFFERENT constant — Back scales its overshoot
  // by 1.525 and Elastic widens its period from 0.4 to 0.45 — so forcing the relation here would be
  // asserting a curve the family does not have.
  halvesMatch: boolean;
  // Whether easeIn rises without ever stepping back. False where the shape is the point: Back undershoots
  // below 0, Elastic oscillates, Bounce bounces.
  monotonic: boolean;
  name: string;
}

const FAMILIES: readonly Family[] = [
  {
    easeIn: easeInBack,
    easeInOut: easeInOutBack,
    easeOut: easeOutBack,
    halvesMatch: false,
    monotonic: false,
    name: 'Back',
  },
  {
    easeIn: easeInBounce,
    easeInOut: easeInOutBounce,
    easeOut: easeOutBounce,
    halvesMatch: true,
    monotonic: false,
    name: 'Bounce',
  },
  {
    easeIn: easeInCircular,
    easeInOut: easeInOutCircular,
    easeOut: easeOutCircular,
    halvesMatch: true,
    monotonic: true,
    name: 'Circular',
  },
  {
    easeIn: easeInCubic,
    easeInOut: easeInOutCubic,
    easeOut: easeOutCubic,
    halvesMatch: true,
    monotonic: true,
    name: 'Cubic',
  },
  {
    easeIn: easeInElastic,
    easeInOut: easeInOutElastic,
    easeOut: easeOutElastic,
    halvesMatch: false,
    monotonic: false,
    name: 'Elastic',
  },
  {
    easeIn: easeInExponential,
    easeInOut: easeInOutExponential,
    easeOut: easeOutExponential,
    halvesMatch: true,
    monotonic: true,
    name: 'Exponential',
  },
  {
    easeIn: easeInQuadratic,
    easeInOut: easeInOutQuadratic,
    easeOut: easeOutQuadratic,
    halvesMatch: true,
    monotonic: true,
    name: 'Quadratic',
  },
  {
    easeIn: easeInQuartic,
    easeInOut: easeInOutQuartic,
    easeOut: easeOutQuartic,
    halvesMatch: true,
    monotonic: true,
    name: 'Quartic',
  },
  {
    easeIn: easeInQuintic,
    easeInOut: easeInOutQuintic,
    easeOut: easeOutQuintic,
    halvesMatch: true,
    monotonic: true,
    name: 'Quintic',
  },
  {
    easeIn: easeInSine,
    easeInOut: easeInOutSine,
    easeOut: easeOutSine,
    halvesMatch: true,
    monotonic: true,
    name: 'Sine',
  },
];

// 201 points rather than a handful: a copy-paste between neighbours can agree at the sample points a
// hand-picked list would choose, and cannot agree across the whole unit interval.
const SAMPLES: readonly number[] = Array.from({ length: 201 }, (_, index) => index / 200);

// The measured worst reflection error across every family is 1.1e-15, so this bound is roughly three
// orders of magnitude tighter than the smallest real difference a wrong constant could produce, and
// still far above double-precision noise.
const EPSILON = 1e-12;

describe('easing family distinctness', () => {
  // The direct test for the copy-paste defect, and the only one that can see it: two families whose
  // bodies were pasted from each other agree everywhere, and every other assertion in this file passes
  // for both. The measured closest pair is Quadratic against Sine at 5.6e-2, so this bound sits an order
  // of magnitude below the nearest real neighbours and far above any rounding difference.
  it.each(['easeIn', 'easeInOut', 'easeOut'] as const)('%s curves are pairwise distinct', (direction) => {
    for (let a = 0; a < FAMILIES.length; a += 1) {
      for (let b = a + 1; b < FAMILIES.length; b += 1) {
        const first = FAMILIES[a][direction];
        const second = FAMILIES[b][direction];
        const separation = SAMPLES.reduce((worst, t) => Math.max(worst, Math.abs(first(t) - second(t))), 0);
        expect({ pair: `${FAMILIES[a].name}/${FAMILIES[b].name}`, separated: separation > 0.005 }).toEqual({
          pair: `${FAMILIES[a].name}/${FAMILIES[b].name}`,
          separated: true,
        });
      }
    }
  });
});

describe('easing family endpoints', () => {
  // EXACT, not approximate — except where the formula itself cannot be exact in binary floating point,
  // and those two are named rather than folded into a loose tolerance for everyone. easeInSine(1) is
  // 1 - cos(pi/2) and cos(pi/2) is 6.1e-17 rather than 0; easeInBack(1) is (s + 1) - s, which cancels to
  // 0.9999999999999998 for s = 1.70158. Both are one ulp, both are properties of the arithmetic, and
  // special-casing the code to force a rounder number would be making the curve fit the test.
  const INEXACT_AT_ONE = new Set(['Back', 'Sine']);

  // OBSERVED, and harmless: easeInBack(0) and easeInOutSine(0) return NEGATIVE zero, because both bodies
  // end in a multiplication by zero with a negative factor. It is numerically equal to 0 and behaves
  // identically everywhere an easing value is consumed; only Object.is separates them, which is what
  // `toBe` uses. Normalising rather than loosening keeps the assertion EXACT for every other value.
  it.each(FAMILIES)('$name: starts at exactly 0', ({ easeIn, easeInOut, easeOut }) => {
    expect(normalizeZero(easeIn(0))).toBe(0);
    expect(normalizeZero(easeInOut(0))).toBe(0);
    expect(Math.abs(easeOut(0))).toBeLessThan(EPSILON);
  });

  it.each(FAMILIES)('$name: ends at 1, exactly where the arithmetic allows', ({ easeIn, easeInOut, easeOut }) => {
    expect(easeOut(1)).toBe(1);
    expect(easeInOut(1)).toBe(1);
    if (INEXACT_AT_ONE.has(name(easeIn))) expect(easeIn(1)).toBeCloseTo(1, 15);
    else expect(easeIn(1)).toBe(1);
  });

  function normalizeZero(value: number): number {
    return value === 0 ? 0 : value;
  }

  function name(easeIn: EasingFunction): string {
    return FAMILIES.find((family) => family.easeIn === easeIn)!.name;
  }
});

describe('easing family halves', () => {
  it.each(FAMILIES.filter((family) => family.halvesMatch))(
    '$name: easeInOut is easeIn on the first half and easeOut on the second',
    ({ easeIn, easeInOut, easeOut }) => {
      for (const t of SAMPLES) {
        const expected = t <= 0.5 ? easeIn(t * 2) / 2 : 0.5 + easeOut(t * 2 - 1) / 2;
        expect(Math.abs(easeInOut(t) - expected)).toBeLessThan(EPSILON);
      }
    },
  );

  // The two exceptions are asserted as exceptions rather than skipped, so a later edit that "fixes" one
  // of them into the scaled-halves shape fails here and has to be a deliberate change to the curve.
  it.each(FAMILIES.filter((family) => !family.halvesMatch))(
    '$name: easeInOut deliberately differs from the scaled halves, because its canonical constant differs',
    ({ easeIn, easeInOut }) => {
      const worst = SAMPLES.filter((t) => t <= 0.5).reduce(
        (accumulated, t) => Math.max(accumulated, Math.abs(easeInOut(t) - easeIn(t * 2) / 2)),
        0,
      );
      expect(worst).toBeGreaterThan(0.01);
    },
  );

  // Continuity asserted as the gap SHRINKING with the interval, not as the gap being small. A small-gap
  // test is the wrong instrument here: Circular has a vertical tangent at the midpoint by construction —
  // it is a quarter circle — so its slope there measures ~1000 against 0.58 at t=0.25, and any fixed
  // bound either fails a correct curve or is loose enough to accept a real step. A genuine discontinuity
  // has a gap that stops shrinking; a steep one has a gap that keeps going.
  it.each(FAMILIES)('$name: easeInOut passes through the midpoint without a step', ({ easeInOut }) => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    const wide = Math.abs(easeInOut(0.5 + 1e-4) - easeInOut(0.5 - 1e-4));
    const narrow = Math.abs(easeInOut(0.5 + 1e-6) - easeInOut(0.5 - 1e-6));
    expect(narrow).toBeLessThan(Math.max(wide / 2, 1e-9));
  });
});

describe('easing family reflection', () => {
  // The workhorse. easeOut is easeIn rotated 180 degrees about the centre of the unit square, and that
  // holds BY DEFINITION for every family here — so a constant that differs between the two, or a body
  // pasted from the wrong neighbour, breaks it at once.
  it.each(FAMILIES)('$name: easeOut(t) is 1 - easeIn(1 - t) across the interval', ({ easeIn, easeOut }) => {
    for (const t of SAMPLES) {
      expect(Math.abs(easeOut(t) - (1 - easeIn(1 - t)))).toBeLessThan(EPSILON);
    }
  });
});

describe('easing family shape', () => {
  it.each(FAMILIES.filter((family) => family.monotonic))('$name: easeIn never steps back', ({ easeIn }) => {
    for (let index = 1; index < SAMPLES.length; index += 1) {
      expect(easeIn(SAMPLES[index])).toBeGreaterThanOrEqual(easeIn(SAMPLES[index - 1]));
    }
  });

  // The overshoot IS the family. A wrong constant removes it silently and leaves a curve that still runs
  // 0 to 1 monotonically — which every endpoint assertion in this package would happily accept.
  it.each([
    { easeIn: easeInBack, easeOut: easeOutBack, name: 'Back' },
    { easeIn: easeInElastic, easeOut: easeOutElastic, name: 'Elastic' },
  ])('$name: easeIn dips below 0 and easeOut rises above 1', ({ easeIn, easeOut }) => {
    expect(Math.min(...SAMPLES.map(easeIn))).toBeLessThan(-0.05);
    expect(Math.max(...SAMPLES.map(easeOut))).toBeGreaterThan(1.05);
  });

  it('Bounce reverses without ever leaving the unit interval', () => {
    const values = SAMPLES.map(easeInBounce);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(values.some((value, index) => index > 0 && value < values[index - 1])).toBe(true);
  });
});
