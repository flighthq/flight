// Generated from crates/flight-easing/tests/ease_steps_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { getStepPositionString, parseStepPosition, setEasingStepsGuard } from '@flighthq/easing/contract';
import { describe, expect, it } from 'vitest';

import { easeSteps } from './contract.ts';
import type { EasingFunction } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeSteps', () => {
  it('jump end holds at 0 first and reaches 1 only at t 1', () => {
    const ease: EasingFunction = easeSteps(4, 'jumpEnd');
    expect(ease(0.0)).toEqual(0.0);
    expect(ease(0.1)).toEqual(0.0);
    assertApprox(ease(0.25), 0.25);
    assertApprox(ease(0.6), 0.5);
    assertApprox(ease(0.99), 0.75);
    expect(ease(1.0)).toEqual(1.0);
  });
  it('jump end is the default position', () => {
    const explicit: EasingFunction = easeSteps(4, 'jumpEnd');
    const implicit: EasingFunction = easeSteps(4, undefined);
    for (let i = 0; i <= 10; i += 1) {
      expect(implicit(i / 10.0)).toEqual(explicit(i / 10.0));
    }
  });
  it('jump start jumps immediately and reaches 1 before t 1', () => {
    const ease: EasingFunction = easeSteps(4, 'jumpStart');
    assertApprox(ease(0.0), 0.25);
    assertApprox(ease(0.1), 0.25);
    assertApprox(ease(0.5), 0.75);
    expect(ease(0.99)).toEqual(1.0);
    expect(ease(1.0)).toEqual(1.0);
  });
  it('jump none spans the closed range 0 to 1 with count minus 1 jumps', () => {
    const ease: EasingFunction = easeSteps(4, 'jumpNone');
    expect(ease(0.0)).toEqual(0.0);
    assertApprox(ease(0.25), 1.0 / 3.0);
    assertApprox(ease(0.5), 2.0 / 3.0);
    expect(ease(0.99)).toEqual(1.0);
    expect(ease(1.0)).toEqual(1.0);
  });
  it('jump none with count 1 yields nan', () => {
    const ease: EasingFunction = easeSteps(1, 'jumpNone');
    expect(Number.isNaN(ease(0.0))).toBe(true);
    expect(Number.isNaN(ease(0.5))).toBe(true);
    expect(Number.isNaN(ease(1.0))).toBe(true);
  });
  it('jump both never outputs 0 at the start', () => {
    const ease: EasingFunction = easeSteps(4, 'jumpBoth');
    assertApprox(ease(0.0), 0.2);
    assertApprox(ease(0.1), 0.2);
    assertApprox(ease(0.25), 0.4);
    assertApprox(ease(0.99), 0.8);
    expect(ease(1.0)).toEqual(1.0);
  });
  it('is monotonically non decreasing for jump end', () => {
    const ease: EasingFunction = easeSteps(5, 'jumpEnd');
    let prev = ease(0.0);
    for (let i = 1; i <= 50; i += 1) {
      const value = ease(i / 50.0);
      expect(value >= prev).toBe(true);
      prev = value;
    }
  });
});

describe('getStepPositionString', () => {
  it('returns the exact ts strings', () => {
    expect(getStepPositionString('jumpStart')).toEqual('jumpStart');
    expect(getStepPositionString('jumpEnd')).toEqual('jumpEnd');
    expect(getStepPositionString('jumpNone')).toEqual('jumpNone');
    expect(getStepPositionString('jumpBoth')).toEqual('jumpBoth');
  });
});

describe('parseStepPosition', () => {
  it('parses the exact ts strings', () => {
    expect(parseStepPosition('jumpStart')).toEqual('jumpStart');
    expect(parseStepPosition('jumpEnd')).toEqual('jumpEnd');
    expect(parseStepPosition('jumpNone')).toEqual('jumpNone');
    expect(parseStepPosition('jumpBoth')).toEqual('jumpBoth');
  });
  it('rejects other text and wrong casing', () => {
    expect(parseStepPosition('JumpNone')).toEqual(undefined);
    expect(parseStepPosition('jumpnone')).toEqual(undefined);
    expect(parseStepPosition('')).toEqual(undefined);
  });
});

describe('setEasingStepsGuard', () => {
  it('is available to the target native guard suite', () => {
    const ClearGuard = () => setEasingStepsGuard(null);
  });
});
