import { describe, expect, it } from 'vitest';

import { createSpring3D, isSpring3DSettled, updateSpring3D } from './spring3D';
import { createSpringConfig } from './springConfig';

describe('createSpring3D', () => {
  it('defaults all axes to value 0 and velocity 0', () => {
    const spring = createSpring3D();
    expect(spring.x.value).toBe(0);
    expect(spring.y.value).toBe(0);
    expect(spring.z.value).toBe(0);
    expect(spring.x.velocity).toBe(0);
    expect(spring.y.velocity).toBe(0);
    expect(spring.z.velocity).toBe(0);
  });

  it('sets per-axis value and velocity', () => {
    const spring = createSpring3D(1, 2, 3, 4, 5, 6);
    expect(spring.x.value).toBe(1);
    expect(spring.y.value).toBe(2);
    expect(spring.z.value).toBe(3);
    expect(spring.x.velocity).toBe(4);
    expect(spring.y.velocity).toBe(5);
    expect(spring.z.velocity).toBe(6);
  });
});

describe('isSpring3DSettled', () => {
  it('is false until all three axes rest at their targets', () => {
    const spring = createSpring3D(0, 0, 0);
    const config = createSpringConfig(4, 1);
    expect(isSpring3DSettled(spring, 10, -6, 3)).toBe(false);
    for (let i = 0; i < 600; i++) updateSpring3D(spring, 10, -6, 3, config, 1 / 60);
    expect(isSpring3DSettled(spring, 10, -6, 3)).toBe(true);
  });
});

describe('updateSpring3D', () => {
  it('moves all three components toward their targets', () => {
    const spring = createSpring3D(0, 0, 0);
    const config = createSpringConfig(2, 1);
    updateSpring3D(spring, 10, -20, 30, config, 1 / 60);
    expect(spring.x.value).toBeGreaterThan(0);
    expect(spring.y.value).toBeLessThan(0);
    expect(spring.z.value).toBeGreaterThan(0);
  });
});
