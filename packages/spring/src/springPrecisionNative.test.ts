// Target-native f64 precision checks: Rust f32 cannot express these bounds, so they are hand-maintained here.
import { describe, expect, it } from 'vitest';

import { createSpring, createSpringConfig, updateSpring } from './contract.ts';

describe('updateSpring', () => {
  it('preserves oscillation energy when dampingRatio is exactly zero', () => {
    const frequency = 2;
    const target = 3;
    const spring = createSpring(7, -4);
    const config = createSpringConfig(frequency, 0);
    const omega = Math.PI * 2 * frequency;
    const initialEnergy = spring.velocity * spring.velocity + omega * omega * (spring.value - target) ** 2;

    for (let i = 0; i < 600; i++) updateSpring(spring, target, config, 1 / 60);

    const finalEnergy = spring.velocity * spring.velocity + omega * omega * (spring.value - target) ** 2;
    expect(finalEnergy).toBeCloseTo(initialEnergy, 8);
  });

  it('is frame-rate independent for a constant target (analytic semigroup)', () => {
    const config = createSpringConfig(2, 0.5);
    const target = 7;

    const fine = createSpring(0, 3);
    for (let i = 0; i < 60; i++) updateSpring(fine, target, config, 1 / 60);

    const coarse = createSpring(0, 3);
    updateSpring(coarse, target, config, 1);

    expect(fine.value).toBeCloseTo(coarse.value, 6);
    expect(fine.velocity).toBeCloseTo(coarse.velocity, 6);
  });
});
