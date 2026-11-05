// Generated from crates/flight-spring/tests/spring3d_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  addSpringImpulse3D,
  createSpring3D,
  createSpringConfig,
  initializeSpring3D,
  isSpring3DSettled,
  resetSpring3D,
  updateSpring3D,
} from './contract.ts';
import type { SpringConfig } from './contract.ts';

function springConfig(frequency: number, dampingRatio: number): SpringConfig {
  return createSpringConfig(frequency, dampingRatio);
}

describe('addSpringImpulse3D', () => {
  it('adds each velocity component without changing any value', () => {
    let spring = createSpring3D(10, 20, 30, 1, 2, 3);
    addSpringImpulse3D(spring, 3, -5, 7);
    expect(spring.x.value).toEqual(10);
    expect(spring.x.velocity).toEqual(4);
    expect(spring.y.value).toEqual(20);
    expect(spring.y.velocity).toEqual(-3);
    expect(spring.z.value).toEqual(30);
    expect(spring.z.velocity).toEqual(10);
  });
});

describe('createSpring3D', () => {
  it('defaults all axes to value zero and velocity zero', () => {
    const spring = createSpring3D(0, 0, 0, 0, 0, 0);
    expect(spring.x.value).toEqual(0);
    expect(spring.y.value).toEqual(0);
    expect(spring.z.value).toEqual(0);
    expect(spring.x.velocity).toEqual(0);
    expect(spring.y.velocity).toEqual(0);
    expect(spring.z.velocity).toEqual(0);
  });
  it('sets the provided per axis value and velocity', () => {
    const spring = createSpring3D(1, 2, 3, 4, 5, 6);
    expect(spring.x.value).toEqual(1);
    expect(spring.y.value).toEqual(2);
    expect(spring.z.value).toEqual(3);
    expect(spring.x.velocity).toEqual(4);
    expect(spring.y.velocity).toEqual(5);
    expect(spring.z.velocity).toEqual(6);
  });
});

describe('initializeSpring3D', () => {
  it('is the construction initializer of create spring3d', () => {
    let spring = createSpring3D(1, 2, 3, 4, 5, 6);
    const id = spring;
    const xId = spring.x;
    const yId = spring.y;
    const zId = spring.z;
    initializeSpring3D(spring, 0, 0, 0, 0, 0, 0);
    expect(spring.x.value).toEqual(0);
    expect(spring.y.value).toEqual(0);
    expect(spring.z.value).toEqual(0);
    expect(spring.x.velocity).toEqual(0);
    expect(spring.y.velocity).toEqual(0);
    expect(spring.z.velocity).toEqual(0);
    expect(spring).toBe(id);
    expect(spring.x).toBe(xId);
    expect(spring.y).toBe(yId);
    expect(spring.z).toBe(zId);
  });
});

describe('isSpring3DSettled', () => {
  it('is false until all three axes rest at their targets', () => {
    let spring = createSpring3D(0, 0, 0, 0, 0, 0);
    const config = springConfig(4, 1);
    expect(!isSpring3DSettled(spring, 10, -6, 3, undefined, undefined)).toBe(true);
    for (let _ = 0; _ < 600; _++) {
      updateSpring3D(spring, 10, -6, 3, config, 1 / 60);
    }
    expect(isSpring3DSettled(spring, 10, -6, 3, undefined, undefined)).toBe(true);
  });
});

describe('resetSpring3D', () => {
  it('mirrors scalar reset for values explicit velocities and zero defaults', () => {
    let spring = createSpring3D(1, 2, 3, 4, 5, 6);
    const xId = spring.x;
    const yId = spring.y;
    const zId = spring.z;
    resetSpring3D(spring, 10, 20, 30, 40, 50, 60);
    expect(spring.x).toBe(xId);
    expect(spring.y).toBe(yId);
    expect(spring.z).toBe(zId);
    expect(spring.x.value).toEqual(10);
    expect(spring.x.velocity).toEqual(40);
    expect(spring.y.value).toEqual(20);
    expect(spring.y.velocity).toEqual(50);
    expect(spring.z.value).toEqual(30);
    expect(spring.z.velocity).toEqual(60);
    resetSpring3D(spring, -10, -20, -30, undefined, undefined, undefined);
    expect(spring.x.value).toEqual(-10);
    expect(spring.x.velocity).toEqual(0);
    expect(spring.y.value).toEqual(-20);
    expect(spring.y.velocity).toEqual(0);
    expect(spring.z.value).toEqual(-30);
    expect(spring.z.velocity).toEqual(0);
  });
});

describe('updateSpring3D', () => {
  it('moves all three components toward their targets', () => {
    let spring = createSpring3D(0, 0, 0, 0, 0, 0);
    const config = springConfig(2, 1);
    updateSpring3D(spring, 10, -20, 30, config, 1 / 60);
    expect(spring.x.value > 0).toBe(true);
    expect(spring.y.value < 0).toBe(true);
    expect(spring.z.value > 0).toBe(true);
  });
});
