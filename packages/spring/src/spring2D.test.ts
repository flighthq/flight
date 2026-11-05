// Generated from crates/flight-spring/tests/spring2d_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  addSpringImpulse2D,
  createSpring2D,
  createSpringConfig,
  initializeSpring2D,
  isSpring2DSettled,
  resetSpring2D,
  updateSpring2D,
} from './contract.ts';
import type { SpringConfig } from './contract.ts';

function springConfig(frequency: number, dampingRatio: number): SpringConfig {
  return createSpringConfig(frequency, dampingRatio);
}

describe('addSpringImpulse2D', () => {
  it('adds each velocity component without changing either value', () => {
    let spring = createSpring2D(10, 20, 1, 2);
    addSpringImpulse2D(spring, 3, -5);
    expect(spring.x.value).toEqual(10);
    expect(spring.x.velocity).toEqual(4);
    expect(spring.y.value).toEqual(20);
    expect(spring.y.velocity).toEqual(-3);
  });
});

describe('createSpring2D', () => {
  it('defaults both axes to value zero and velocity zero', () => {
    const spring = createSpring2D(0, 0, 0, 0);
    expect(spring.x.value).toEqual(0);
    expect(spring.x.velocity).toEqual(0);
    expect(spring.y.value).toEqual(0);
    expect(spring.y.velocity).toEqual(0);
  });
  it('sets the provided per axis value and velocity', () => {
    const spring = createSpring2D(1, 2, 3, 4);
    expect(spring.x.value).toEqual(1);
    expect(spring.y.value).toEqual(2);
    expect(spring.x.velocity).toEqual(3);
    expect(spring.y.velocity).toEqual(4);
  });
});

describe('initializeSpring2D', () => {
  it('is the construction initializer of create spring2d', () => {
    let spring = createSpring2D(5, 6, 7, 8);
    const id = spring;
    const xId = spring.x;
    const yId = spring.y;
    initializeSpring2D(spring, 0, 0, 0, 0);
    expect(spring.x.value).toEqual(0);
    expect(spring.y.value).toEqual(0);
    expect(spring.x.velocity).toEqual(0);
    expect(spring.y.velocity).toEqual(0);
    expect(spring).toBe(id);
    expect(spring.x).toBe(xId);
    expect(spring.y).toBe(yId);
  });
});

describe('isSpring2DSettled', () => {
  it('is false until both axes rest at their targets', () => {
    let spring = createSpring2D(0, 0, 0, 0);
    const config = springConfig(4, 1);
    expect(!isSpring2DSettled(spring, 10, -6, undefined, undefined)).toBe(true);
    for (let _ = 0; _ < 600; _++) {
      updateSpring2D(spring, 10, -6, config, 1 / 60);
    }
    expect(isSpring2DSettled(spring, 10, -6, undefined, undefined)).toBe(true);
  });
});

describe('resetSpring2D', () => {
  it('mirrors scalar reset for values explicit velocities and zero defaults', () => {
    let spring = createSpring2D(1, 2, 3, 4);
    const xId = spring.x;
    const yId = spring.y;
    resetSpring2D(spring, 10, 20, 30, 40);
    expect(spring.x).toBe(xId);
    expect(spring.y).toBe(yId);
    expect(spring.x.value).toEqual(10);
    expect(spring.x.velocity).toEqual(30);
    expect(spring.y.value).toEqual(20);
    expect(spring.y.velocity).toEqual(40);
    resetSpring2D(spring, -10, -20, undefined, undefined);
    expect(spring.x.value).toEqual(-10);
    expect(spring.x.velocity).toEqual(0);
    expect(spring.y.value).toEqual(-20);
    expect(spring.y.velocity).toEqual(0);
  });
});

describe('updateSpring2D', () => {
  it('moves both components toward their targets', () => {
    let spring = createSpring2D(0, 0, 0, 0);
    const config = springConfig(2, 1);
    updateSpring2D(spring, 10, -20, config, 1 / 60);
    expect(spring.x.value > 0).toBe(true);
    expect(spring.y.value < 0).toBe(true);
  });
  it('drives the axes independently', () => {
    let spring = createSpring2D(0, 0, 0, 0);
    const config = springConfig(2, 0.8);
    for (let _ = 0; _ < 30; _++) {
      updateSpring2D(spring, 10, 5, config, 1 / 60);
    }
    expect(
      Math.abs(spring.x.value - spring.y.value) > 1e-3,
      `axes should differ: x=${spring.x.value}, y=${spring.y.value}`,
    ).toBe(true);
  });
});
