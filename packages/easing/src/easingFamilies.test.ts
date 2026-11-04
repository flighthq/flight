// Generated from crates/flight-easing/tests/easing_families_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

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
} from './contract.ts';

type Ease = (arg0: number) => number;

interface Family {
  easeIn: Ease;
  easeInOut: Ease;
  easeOut: Ease;
  halvesMatch: boolean;
  monotonic: boolean;
  name: string;
}

const RELATION_EPSILON: number = 1e-5;

const SEPARATION_EPSILON: number = 0.005;

function families(): Family[] {
  return [
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
}

function samples(): number[] {
  return Array.from({ length: 200 - 0 + 1 }, (_, index) => 0 + index).map((index) => index / 200.0);
}

function normalizeZero(value: number): number {
  return value === 0.0 ? 0.0 : value;
}

function assertPairwiseDistinct(curves: Readonly<Array<readonly [string, Ease]>>): void {
  const points = samples();
  for (let a = 0; a < curves.length; a += 1) {
    for (let b = a + 1; b < curves.length; b += 1) {
      const first = curves[a][1];
      const second = curves[b][1];
      let worst = 0.0;
      for (const t of points) {
        const separation = Math.abs(first(t) - second(t));
        if (separation > worst) {
          worst = separation;
        }
      }
      expect(worst > SEPARATION_EPSILON, `${curves[a][0]} and ${curves[b][0]} are not distinct: ${worst}`).toBe(true);
    }
  }
}

describe('easingFamilyDistinctness', () => {
  it('ease in curves are pairwise distinct', () => {
    const familyValues: Family[] = families();
    const curves: Array<readonly [string, Ease]> = familyValues.map((family) => [family.name, family.easeIn]);
    assertPairwiseDistinct(curves);
  });
  it('ease in out curves are pairwise distinct', () => {
    const familyValues: Family[] = families();
    const curves: Array<readonly [string, Ease]> = familyValues.map((family) => [family.name, family.easeInOut]);
    assertPairwiseDistinct(curves);
  });
  it('ease out curves are pairwise distinct', () => {
    const familyValues: Family[] = families();
    const curves: Array<readonly [string, Ease]> = familyValues.map((family) => [family.name, family.easeOut]);
    assertPairwiseDistinct(curves);
  });
});

describe('easingFamilyEndpoints', () => {
  it('starts at exactly 0', () => {
    const familyValues: Family[] = families();
    for (let familyIndex = 0; familyIndex < familyValues.length; familyIndex += 1) {
      const family = familyValues[familyIndex];
      expect(normalizeZero(family.easeIn(0.0)), `${family.name} easeIn`).toEqual(0.0);
      expect(normalizeZero(family.easeInOut(0.0)), `${family.name} easeInOut`).toEqual(0.0);
      expect(Math.abs(family.easeOut(0.0)) < RELATION_EPSILON, `${family.name} easeOut does not start at 0`).toBe(true);
    }
  });
  it('ends at 1 where the arithmetic allows', () => {
    const familyValues: Family[] = families();
    for (let familyIndex = 0; familyIndex < familyValues.length; familyIndex += 1) {
      const family = familyValues[familyIndex];
      expect(Math.abs(family.easeOut(1.0) - 1.0) < RELATION_EPSILON, `${family.name} easeOut does not end at 1`).toBe(
        true,
      );
      expect(
        Math.abs(family.easeInOut(1.0) - 1.0) < RELATION_EPSILON,
        `${family.name} easeInOut does not end at 1`,
      ).toBe(true);
      expect(Math.abs(family.easeIn(1.0) - 1.0) < RELATION_EPSILON, `${family.name} easeIn does not end at 1`).toBe(
        true,
      );
    }
  });
});

describe('easingFamilyHalves', () => {
  it('ease in out matches the scaled halves where the constant matches', () => {
    const points = samples();
    const familyValues: Family[] = families();
    for (let familyIndex = 0; familyIndex < familyValues.length; familyIndex += 1) {
      const family = familyValues[familyIndex];
      if (family.halvesMatch) {
        for (const t of points) {
          const expected = t <= 0.5 ? family.easeIn(t * 2.0) / 2.0 : 0.5 + family.easeOut(t * 2.0 - 1.0) / 2.0;
          const actual = family.easeInOut(t);
          expect(
            Math.abs(actual - expected) < RELATION_EPSILON,
            `${family.name} halves differ at ${t}: ${actual} vs ${expected}`,
          ).toBe(true);
        }
      }
    }
  });
  it('ease in out deliberately differs where the canonical constant differs', () => {
    const points = samples();
    const familyValues: Family[] = families();
    for (let familyIndex = 0; familyIndex < familyValues.length; familyIndex += 1) {
      const family = familyValues[familyIndex];
      if (!family.halvesMatch) {
        let worst = 0.0;
        for (const t of points.filter((t) => t <= 0.5)) {
          const difference = Math.abs(family.easeInOut(t) - family.easeIn(t * 2.0) / 2.0);
          if (difference > worst) {
            worst = difference;
          }
        }
        expect(worst > 0.01, `${family.name} unexpectedly matches its scaled halves`).toBe(true);
      }
    }
  });
  it('ease in out passes through the midpoint without a step', () => {
    const familyValues: Family[] = families();
    for (let familyIndex = 0; familyIndex < familyValues.length; familyIndex += 1) {
      const family = familyValues[familyIndex];
      const midpoint = family.easeInOut(0.5);
      expect(Math.abs(midpoint - 0.5) < RELATION_EPSILON, `${family.name} does not pass through 0.5`).toBe(true);
      const wide = Math.abs(family.easeInOut(0.5 + 1e-4) - family.easeInOut(0.5 - 1e-4));
      const narrow = Math.abs(family.easeInOut(0.5 + 1e-6) - family.easeInOut(0.5 - 1e-6));
      expect(narrow < Math.max(wide / 2.0, 1e-9), `${family.name} has a step at the midpoint`).toBe(true);
    }
  });
});

describe('easingFamilyReflection', () => {
  it('ease out is the reflection of ease in across the interval', () => {
    const points = samples();
    const familyValues: Family[] = families();
    for (let familyIndex = 0; familyIndex < familyValues.length; familyIndex += 1) {
      const family = familyValues[familyIndex];
      for (const t of points) {
        const reflected = 1.0 - family.easeIn(1.0 - t);
        const actual = family.easeOut(t);
        expect(
          Math.abs(actual - reflected) < RELATION_EPSILON,
          `${family.name} is not reflected at ${t}: ${actual} vs ${reflected}`,
        ).toBe(true);
      }
    }
  });
});

describe('easingFamilyShape', () => {
  it('ease in never steps back for monotonic families', () => {
    const points = samples();
    const familyValues: Family[] = families();
    for (let familyIndex = 0; familyIndex < familyValues.length; familyIndex += 1) {
      const family = familyValues[familyIndex];
      if (family.monotonic) {
        let previous = family.easeIn(points[0]);
        for (const t of points.slice(1)) {
          const value = family.easeIn(t);
          expect(value >= previous - RELATION_EPSILON, `${family.name} steps back at ${t}`).toBe(true);
          previous = value;
        }
      }
    }
  });
  it('back and elastic overshoot the unit interval', () => {
    const points = samples();
    for (const name of ['Back', 'Elastic']) {
      const familyValues: Family[] = families();
      const family = (() => {
        const value = familyValues.find((family) => family.name === name);
        if (value === undefined) throw new Error('family exists');
        return value;
      })();
      const minimum = points
        .map((t) => family.easeIn(t))
        .reduce((left, right) => Math.min(left, right), Number.POSITIVE_INFINITY);
      const maximum = points
        .map((t) => family.easeOut(t))
        .reduce((left, right) => Math.max(left, right), Number.NEGATIVE_INFINITY);
      expect(minimum < -0.05, `${name} easeIn does not dip below 0`).toBe(true);
      expect(maximum > 1.05, `${name} easeOut does not rise above 1`).toBe(true);
    }
  });
  it('bounce reverses without leaving the unit interval', () => {
    const points = samples();
    const values: number[] = points.map((t) => easeInBounce(t));
    expect(values.every((value) => value >= 0.0 && value <= 1.0)).toBe(true);
    expect(
      Array.from({ length: Math.max(0, values.length - 2 + 1) }, (_, index) => values.slice(index, index + 2)).some(
        (pair) => pair[1] < pair[0],
      ),
      `Bounce must reverse somewhere`,
    ).toBe(true);
  });
});
