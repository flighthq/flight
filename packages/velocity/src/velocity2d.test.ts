// Generated from crates/flight-velocity/tests/velocity2d_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  addVelocity,
  clampVelocity,
  cloneVelocity2d,
  copyVelocity,
  dampVelocity,
  isVelocityZero,
  lengthOfVelocity,
  lerpVelocity,
  normalizeVelocity,
  scaleVelocity,
  subtractVelocity,
  zeroVelocity,
} from './contract.ts';
import type { Velocity2D } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('addVelocity', () => {
  it('adds two velocity vectors', () => {
    const a: Velocity2D = { x: 1.0, y: 2.0 };
    const b: Velocity2D = { x: 3.0, y: 4.0 };
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    addVelocity(out, a, b);
    expect(out.x).toEqual(4.0);
    expect(out.y).toEqual(6.0);
  });
  it('is alias safe when out equals a', () => {
    let a: Velocity2D = { x: 5.0, y: 3.0 };
    const aClone = cloneVelocity2d(a);
    addVelocity(a, aClone, { x: 1.0, y: 1.0 });
    expect(a.x).toEqual(6.0);
    expect(a.y).toEqual(4.0);
  });
});

describe('clampVelocity', () => {
  it('returns velocity unchanged when length is within max length', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    clampVelocity(out, { x: 3.0, y: 0.0 }, 5.0);
    expect(out.x).toEqual(3.0);
    expect(out.y).toEqual(0.0);
  });
  it('clamps to max length when length exceeds max length', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    clampVelocity(out, { x: 10.0, y: 0.0 }, 5.0);
    assertApprox(out.x, 5.0);
    assertApprox(out.y, 0.0);
  });
  it('clamps a diagonal velocity to max length', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    clampVelocity(out, { x: 3.0, y: 4.0 }, 2.5);
    assertApprox(lengthOfVelocity(out), 2.5);
  });
  it('is alias safe when out equals velocity', () => {
    let v: Velocity2D = { x: 10.0, y: 0.0 };
    const vClone = cloneVelocity2d(v);
    clampVelocity(v, vClone, 5.0);
    assertApprox(v.x, 5.0);
    assertApprox(v.y, 0.0);
  });
  it('handles zero length velocity without division error', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    clampVelocity(out, { x: 0.0, y: 0.0 }, 5.0);
    expect(out.x).toEqual(0.0);
    expect(out.y).toEqual(0.0);
  });
});

describe('cloneVelocity2d', () => {
  it('creates a copy of a velocity', () => {
    const v: Velocity2D = { x: 3.0, y: -7.0 };
    const result = cloneVelocity2d(v);
    expect(result.x).toEqual(v.x);
    expect(result.y).toEqual(v.y);
  });
});

describe('copyVelocity', () => {
  it('copies x and y', () => {
    const source: Velocity2D = { x: 5.0, y: -3.0 };
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    copyVelocity(out, source);
    expect(out.x).toEqual(5.0);
    expect(out.y).toEqual(-3.0);
  });
  it('is alias safe when out equals source', () => {
    let v: Velocity2D = { x: 7.0, y: 2.0 };
    const vClone = cloneVelocity2d(v);
    copyVelocity(v, vClone);
    expect(v.x).toEqual(7.0);
    expect(v.y).toEqual(2.0);
  });
});

describe('dampVelocity', () => {
  it('returns current at factor one', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    dampVelocity(out, { x: 10.0, y: 5.0 }, { x: 0.0, y: 0.0 }, 1.0);
    expect(out.x).toEqual(10.0);
    expect(out.y).toEqual(5.0);
  });
  it('returns previous at factor zero', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    dampVelocity(out, { x: 10.0, y: 5.0 }, { x: 2.0, y: 3.0 }, 0.0);
    expect(out.x).toEqual(2.0);
    expect(out.y).toEqual(3.0);
  });
  it('blends at factor half', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    dampVelocity(out, { x: 10.0, y: 0.0 }, { x: 0.0, y: 0.0 }, 0.5);
    expect(out.x).toEqual(5.0);
    expect(out.y).toEqual(0.0);
  });
  it('is alias safe when out equals current', () => {
    let current: Velocity2D = { x: 10.0, y: 0.0 };
    const currentClone = cloneVelocity2d(current);
    dampVelocity(current, currentClone, { x: 0.0, y: 0.0 }, 0.5);
    expect(current.x).toEqual(5.0);
    expect(current.y).toEqual(0.0);
  });
});

describe('isVelocityZero', () => {
  it('returns true for exact zero', () => {
    expect(isVelocityZero({ x: 0.0, y: 0.0 }, 0.0)).toEqual(true);
  });
  it('returns false for nonzero', () => {
    expect(isVelocityZero({ x: 0.001, y: 0.0 }, 0.0)).toEqual(false);
  });
  it('uses the default epsilon of zero when none is given', () => {
    expect(isVelocityZero({ x: 0.0, y: 0.0 }, undefined)).toEqual(true);
    expect(isVelocityZero({ x: 0.0001, y: 0.0 }, undefined)).toEqual(false);
  });
  it('respects epsilon', () => {
    expect(isVelocityZero({ x: 0.001, y: 0.0 }, 0.01)).toEqual(true);
    expect(isVelocityZero({ x: 0.1, y: 0.0 }, 0.01)).toEqual(false);
  });
});

describe('lengthOfVelocity', () => {
  it('returns the magnitude of the velocity vector', () => {
    assertApprox(lengthOfVelocity({ x: 3.0, y: 4.0 }), 5.0);
  });
  it('returns zero for zero vector', () => {
    expect(lengthOfVelocity({ x: 0.0, y: 0.0 })).toEqual(0.0);
  });
});

describe('lerpVelocity', () => {
  it('returns a at t zero', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    lerpVelocity(out, { x: 1.0, y: 2.0 }, { x: 9.0, y: 8.0 }, 0.0);
    expect(out.x).toEqual(1.0);
    expect(out.y).toEqual(2.0);
  });
  it('returns b at t one', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    lerpVelocity(out, { x: 1.0, y: 2.0 }, { x: 9.0, y: 8.0 }, 1.0);
    expect(out.x).toEqual(9.0);
    expect(out.y).toEqual(8.0);
  });
  it('interpolates at t half', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    lerpVelocity(out, { x: 0.0, y: 0.0 }, { x: 10.0, y: 4.0 }, 0.5);
    expect(out.x).toEqual(5.0);
    expect(out.y).toEqual(2.0);
  });
  it('is alias safe when out equals a', () => {
    let a: Velocity2D = { x: 0.0, y: 0.0 };
    const aClone = cloneVelocity2d(a);
    lerpVelocity(a, aClone, { x: 10.0, y: 0.0 }, 0.5);
    expect(a.x).toEqual(5.0);
    expect(a.y).toEqual(0.0);
  });
});

describe('normalizeVelocity', () => {
  it('returns unit vector for nonzero input', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    normalizeVelocity(out, { x: 3.0, y: 4.0 });
    assertApprox(lengthOfVelocity(out), 1.0);
    assertApprox(out.x, 0.6);
    assertApprox(out.y, 0.8);
  });
  it('returns zero vector for zero input', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    normalizeVelocity(out, { x: 0.0, y: 0.0 });
    expect(out.x).toEqual(0.0);
    expect(out.y).toEqual(0.0);
  });
  it('is alias safe when out equals source', () => {
    let v: Velocity2D = { x: 5.0, y: 0.0 };
    const vClone = cloneVelocity2d(v);
    normalizeVelocity(v, vClone);
    expect(v.x).toEqual(1.0);
    expect(v.y).toEqual(0.0);
  });
});

describe('scaleVelocity', () => {
  it('scales by a factor', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    scaleVelocity(out, { x: 3.0, y: -2.0 }, 2.0);
    expect(out.x).toEqual(6.0);
    expect(out.y).toEqual(-4.0);
  });
  it('is alias safe when out equals velocity', () => {
    let v: Velocity2D = { x: 4.0, y: 2.0 };
    const vClone = cloneVelocity2d(v);
    scaleVelocity(v, vClone, 0.5);
    expect(v.x).toEqual(2.0);
    expect(v.y).toEqual(1.0);
  });
});

describe('subtractVelocity', () => {
  it('subtracts b from a', () => {
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    subtractVelocity(out, { x: 5.0, y: 3.0 }, { x: 2.0, y: 1.0 });
    expect(out.x).toEqual(3.0);
    expect(out.y).toEqual(2.0);
  });
  it('is alias safe when out equals a', () => {
    let a: Velocity2D = { x: 5.0, y: 3.0 };
    const aClone = cloneVelocity2d(a);
    subtractVelocity(a, aClone, { x: 2.0, y: 1.0 });
    expect(a.x).toEqual(3.0);
    expect(a.y).toEqual(2.0);
  });
});

describe('zeroVelocity', () => {
  it('sets both components to zero', () => {
    let v: Velocity2D = { x: 5.0, y: -3.0 };
    zeroVelocity(v);
    expect(v.x).toEqual(0.0);
    expect(v.y).toEqual(0.0);
  });
});
