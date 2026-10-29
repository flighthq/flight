// Generated from crates/flight-velocity/tests/velocity_sample_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createMatrix } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  createVelocitySample,
  explainVelocitySample,
  getVelocitySampleAt,
  isVelocitySampleNonzero,
  readVelocitySample,
  writeVelocitySample,
} from './contract.ts';
import type { Velocity2D } from './contract.ts';

describe('createVelocitySample', () => {
  it('starts with zero velocity no previous transform and untouched frame ids', () => {
    const sample = createVelocitySample();
    expect(sample.previousWorldTransform === null).toBe(true);
    expect(sample.velocity.x).toEqual(0.0);
    expect(sample.velocity.y).toEqual(0.0);
    expect(sample.lastFrameId).toEqual(-1);
    expect(sample.explicitFrameId).toEqual(-1);
  });
});

describe('explainVelocitySample', () => {
  it('reports no sample when the sample is missing', () => {
    const result = explainVelocitySample(null, 3);
    expect(result.reason).toEqual('no-sample');
    expect(result.currentFrameId).toEqual(3);
    expect(result.explicit).toEqual(false);
    expect(result.lastFrameId).toEqual(-1);
    expect(result.x).toEqual(0.0);
    expect(result.y).toEqual(0.0);
  });
  it('reports stale with zero velocity when not touched this frame', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 2, 5.0, 5.0);
    const result = explainVelocitySample(sample, 3);
    expect(result.reason).toEqual('stale');
    expect(result.currentFrameId).toEqual(3);
    expect(result.explicit).toEqual(false);
    expect(result.lastFrameId).toEqual(2);
    expect(result.x).toEqual(0.0);
    expect(result.y).toEqual(0.0);
  });
  it('reports explicit zero for an explicit zero write', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 4, 0.0, 0.0);
    const result = explainVelocitySample(sample, 4);
    expect(result.reason).toEqual('explicit-zero');
    expect(result.explicit).toEqual(true);
    expect(result.lastFrameId).toEqual(4);
  });
  it('reports derived zero for a derived zero velocity', () => {
    let sample = createVelocitySample();
    sample.lastFrameId = 4;
    const result = explainVelocitySample(sample, 4);
    expect(result.reason).toEqual('derived-zero');
    expect(result.explicit).toEqual(false);
    expect(result.lastFrameId).toEqual(4);
  });
  it('reports ok with explicit true for an explicit nonzero write', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 1, 3.0, -4.0);
    const result = explainVelocitySample(sample, 1);
    expect(result.reason).toEqual('ok');
    expect(result.currentFrameId).toEqual(1);
    expect(result.explicit).toEqual(true);
    expect(result.lastFrameId).toEqual(1);
    expect(result.x).toEqual(3.0);
    expect(result.y).toEqual(-4.0);
  });
  it('reports ok with explicit false for a derived nonzero velocity', () => {
    let sample = createVelocitySample();
    sample.velocity.x = 7.0;
    sample.velocity.y = -2.0;
    sample.lastFrameId = 1;
    sample.explicitFrameId = 0;
    const result = explainVelocitySample(sample, 1);
    expect(result.reason).toEqual('ok');
    expect(result.explicit).toEqual(false);
    expect(result.x).toEqual(7.0);
    expect(result.y).toEqual(-2.0);
  });
});

describe('getVelocitySampleAt', () => {
  it('returns zero when the sample has no previous world transform', () => {
    const sample = createVelocitySample();
    const identity = createMatrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let out: Velocity2D = { x: 99.0, y: 99.0 };
    getVelocitySampleAt(sample, identity, 0.0, 0.0, out);
    expect(out.x).toEqual(0.0);
    expect(out.y).toEqual(0.0);
  });
  it('returns translation delta at the origin when transform is translation only', () => {
    let sample = createVelocitySample();
    sample.previousWorldTransform = createMatrix(1.0, 0.0, 0.0, 1.0, 3.0, 4.0);
    const current = createMatrix(1.0, 0.0, 0.0, 1.0, 8.0, 9.0);
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    getVelocitySampleAt(sample, current, 0.0, 0.0, out);
    expect(out.x).toEqual(5.0);
    expect(out.y).toEqual(5.0);
  });
  it('computes affine reprojection for a non origin point', () => {
    let sample = createVelocitySample();
    sample.previousWorldTransform = createMatrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    const current = createMatrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    getVelocitySampleAt(sample, current, 1.0, 0.0, out);
    expect(out.x).toEqual(2.0);
    expect(out.y).toEqual(3.0);
  });
  it('computes correct velocity for a rotating transform at a non origin point', () => {
    let sample = createVelocitySample();
    sample.previousWorldTransform = createMatrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    const rotated90 = createMatrix(0.0, 1.0, -1.0, 0.0, 0.0, 0.0);
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    getVelocitySampleAt(sample, rotated90, 1.0, 0.0, out);
    expect(Math.abs(out.x - -1.0) < 1e-4).toBe(true);
    expect(Math.abs(out.y - 1.0) < 1e-4).toBe(true);
  });
  it('computes the translation delta for a pair of translated transforms', () => {
    let sample = createVelocitySample();
    sample.previousWorldTransform = createMatrix(1.0, 0.0, 0.0, 1.0, 1.0, 2.0);
    const current = createMatrix(1.0, 0.0, 0.0, 1.0, 4.0, 6.0);
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    getVelocitySampleAt(sample, current, 0.0, 0.0, out);
    expect(out.x).toEqual(3.0);
    expect(out.y).toEqual(4.0);
  });
  it('reprojects transforms independently of explicit velocity writes', () => {
    let sample = createVelocitySample();
    sample.previousWorldTransform = createMatrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    const current = createMatrix(1.0, 0.0, 0.0, 1.0, 7.0, 3.0);
    writeVelocitySample(sample, 0, 0.0, 0.0);
    writeVelocitySample(sample, 0, 0.0, 0.0);
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    getVelocitySampleAt(sample, current, 0.0, 0.0, out);
    expect(out.x).toEqual(7.0);
    expect(out.y).toEqual(3.0);
  });
});

describe('isVelocitySampleNonzero', () => {
  it('is false for a missing sample', () => {
    expect(isVelocitySampleNonzero(null, 0)).toEqual(false);
  });
  it('is true for a nonzero sample touched this frame', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 2, 1.0, 0.0);
    expect(isVelocitySampleNonzero(sample, 2)).toEqual(true);
  });
  it('is true when only the y component is nonzero', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 2, 0.0, -1.0);
    expect(isVelocitySampleNonzero(sample, 2)).toEqual(true);
  });
  it('is false for a zero sample touched this frame', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 2, 0.0, 0.0);
    expect(isVelocitySampleNonzero(sample, 2)).toEqual(false);
  });
  it('is false for a stale nonzero sample', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 2, 1.0, 1.0);
    expect(isVelocitySampleNonzero(sample, 3)).toEqual(false);
  });
});

describe('readVelocitySample', () => {
  it('writes zero for a missing sample', () => {
    let out: Velocity2D = { x: 9.0, y: 9.0 };
    readVelocitySample(null, 0, out);
    expect(out.x).toEqual(0.0);
    expect(out.y).toEqual(0.0);
  });
  it('writes the velocity of a sample touched this frame', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 5, 3.0, -4.0);
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    readVelocitySample(sample, 5, out);
    expect(out.x).toEqual(3.0);
    expect(out.y).toEqual(-4.0);
  });
  it('writes zero for a stale sample', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 5, 3.0, -4.0);
    let out: Velocity2D = { x: 9.0, y: 9.0 };
    readVelocitySample(sample, 6, out);
    expect(out.x).toEqual(0.0);
    expect(out.y).toEqual(0.0);
  });
  it('writes the velocity of a derived sample touched this frame', () => {
    let sample = createVelocitySample();
    sample.velocity.x = 2.0;
    sample.velocity.y = 1.0;
    sample.lastFrameId = 5;
    let out: Velocity2D = { x: 0.0, y: 0.0 };
    readVelocitySample(sample, 5, out);
    expect(out.x).toEqual(2.0);
    expect(out.y).toEqual(1.0);
  });
});

describe('writeVelocitySample', () => {
  it('records the velocity and both frame ids', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 3, 1.5, -2.5);
    expect(sample.velocity.x).toEqual(1.5);
    expect(sample.velocity.y).toEqual(-2.5);
    expect(sample.lastFrameId).toEqual(3);
    expect(sample.explicitFrameId).toEqual(3);
  });
  it('overwrites a previous write', () => {
    let sample = createVelocitySample();
    writeVelocitySample(sample, 3, 9.0, 9.0);
    writeVelocitySample(sample, 4, 0.0, 0.0);
    expect(sample.velocity.x).toEqual(0.0);
    expect(sample.velocity.y).toEqual(0.0);
    expect(sample.lastFrameId).toEqual(4);
    expect(sample.explicitFrameId).toEqual(4);
  });
  it('leaves the previous world transform untouched', () => {
    let sample = createVelocitySample();
    sample.previousWorldTransform = createMatrix(1.0, 0.0, 0.0, 1.0, 4.0, 5.0);
    writeVelocitySample(sample, 1, 2.0, 2.0);
    expect(sample.previousWorldTransform!.tx).toEqual(4.0);
  });
});
