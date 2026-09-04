import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  applySpringImpulse2D,
  createSpring2D,
  initializeSpring2D,
  isSpring2DSettled,
  resetSpring2D,
  updateSpring2D,
} from './spring2D';
import { createSpringConfig } from './springConfig';

describe('applySpringImpulse2D', () => {
  it('adds each velocity component without changing either value', () => {
    const spring = createSpring2D(10, 20, 1, 2);

    applySpringImpulse2D(spring, 3, -5);

    expect(spring.x).toMatchObject({ value: 10, velocity: 4 });
    expect(spring.y).toMatchObject({ value: 20, velocity: -3 });
  });
});

describe('createSpring2D', () => {
  it('defaults both axes to value 0 and velocity 0', () => {
    const spring = createSpring2D();
    expect(Object.hasOwn(spring, EntityRuntimeKey)).toBe(true);
    expect(Object.hasOwn(spring.x, EntityRuntimeKey)).toBe(true);
    expect(Object.hasOwn(spring.y, EntityRuntimeKey)).toBe(true);
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

describe('initializeSpring2D', () => {
  it('is the construction initializer of createSpring2D', () => {
    expect(typeof initializeSpring2D).toBe('function');
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

describe('resetSpring2D', () => {
  it('mirrors scalar reset for values, explicit velocities, and zero defaults', () => {
    const spring = createSpring2D(1, 2, 3, 4);
    const x = spring.x;
    const y = spring.y;

    resetSpring2D(spring, 10, 20, 30, 40);
    expect(spring.x).toBe(x);
    expect(spring.y).toBe(y);
    expect(spring.x).toMatchObject({ value: 10, velocity: 30 });
    expect(spring.y).toMatchObject({ value: 20, velocity: 40 });

    resetSpring2D(spring, -10, -20);
    expect(spring.x).toMatchObject({ value: -10, velocity: 0 });
    expect(spring.y).toMatchObject({ value: -20, velocity: 0 });
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
