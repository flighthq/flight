import { describe, expect, it } from 'vitest';

import { createSpring2D, isSpring2DSettled, updateSpring2D } from './spring2D';
import { createSpringConfig } from './springConfig';

describe('createSpring2D', () => {
  it('defaults both axes to value 0 and velocity 0', () => {
    const spring = createSpring2D();
    expect(spring.x.value).toBe(0);
    expect(spring.x.velocity).toBe(0);
    expect(spring.y.value).toBe(0);
    expect(spring.y.velocity).toBe(0);
  });

  it('sets per-axis value and velocity', () => {
    const spring = createSpring2D(1, 2, 3, 4);
    expect(spring.x.value).toBe(1);
    expect(spring.y.value).toBe(2);
    expect(spring.x.velocity).toBe(3);
    expect(spring.y.velocity).toBe(4);
  });
});

describe('isSpring2DSettled', () => {
  it('is false until both axes rest at their targets', () => {
    const spring = createSpring2D(0, 0);
    const config = createSpringConfig(4, 1);
    expect(isSpring2DSettled(spring, 10, -6)).toBe(false);
    for (let i = 0; i < 600; i++) updateSpring2D(spring, 10, -6, config, 1 / 60);
    expect(isSpring2DSettled(spring, 10, -6)).toBe(true);
  });
});

describe('updateSpring2D', () => {
  it('moves both components toward their targets', () => {
    const spring = createSpring2D(0, 0);
    const config = createSpringConfig(2, 1);
    updateSpring2D(spring, 10, -20, config, 1 / 60);
    expect(spring.x.value).toBeGreaterThan(0);
    expect(spring.y.value).toBeLessThan(0);
  });

  it('drives the axes independently (matching the scalar solver per component)', () => {
    // x and y use the same config but different targets, so they should reach different values.
    const spring = createSpring2D(0, 0);
    const config = createSpringConfig(2, 0.8);
    for (let i = 0; i < 30; i++) updateSpring2D(spring, 10, 5, config, 1 / 60);
    expect(spring.x.value).not.toBeCloseTo(spring.y.value, 3);
  });
});
