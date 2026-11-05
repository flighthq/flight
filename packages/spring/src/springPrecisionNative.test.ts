// Generated from crates/flight-spring/tests/spring_precision_native_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { createSpring, createSpringConfig, updateSpring } from './contract.ts';

function assertAccumulatedClose(actual: number, expected: number, digits: number, evaluations: number): void {
  const diff = Math.abs(actual - expected);
  const tsBound = 0.5 * Math.pow(10, -digits);
  const limit = Math.max(tsBound, evaluations * Math.pow(2, -23) * Math.max(Math.abs(expected), 1));
  expect(diff <= limit, `expected ${expected}, got ${actual} (diff: ${diff}, limit: ${limit})`).toBe(true);
}

describe('updateSpring', () => {
  it('preserves oscillation energy when damping ratio is exactly zero', () => {
    const frequency: number = 2;
    const target: number = 3;
    let spring = createSpring(7, -4);
    const config = createSpringConfig(frequency, 0);
    const omega = Math.PI * 2 * frequency;
    const initialEnergy =
      spring.velocity * spring.velocity + omega * omega * (spring.value - target) * (spring.value - target);
    for (let _ = 0; _ < 600; _++) {
      updateSpring(spring, target, config, 1 / 60);
    }
    const finalEnergy =
      spring.velocity * spring.velocity + omega * omega * (spring.value - target) * (spring.value - target);
    assertAccumulatedClose(finalEnergy, initialEnergy, 8, 300);
  });
  it('is frame rate independent for a constant target in velocity', () => {
    const config = createSpringConfig(2, 0.5);
    const target: number = 7;
    let fine = createSpring(0, 3);
    for (let _ = 0; _ < 60; _++) {
      updateSpring(fine, target, config, 1 / 60);
    }
    let coarse = createSpring(0, 3);
    updateSpring(coarse, target, config, 1);
    assertAccumulatedClose(fine.velocity, coarse.velocity, 6, 8);
  });
});
