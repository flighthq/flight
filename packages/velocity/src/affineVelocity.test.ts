import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { invalidateNodeLocalTransform } from '@flighthq/node';

import { contributeAffineVelocity, getVelocitySampleAt } from './affineVelocity';
import {
  beginVelocityFrame,
  contributeVelocity,
  createVelocityField,
  ensureVelocitySample,
  getVelocity,
} from './velocityField';

describe('contributeAffineVelocity', () => {
  it('reports zero velocity on the first frame (no previous transform)', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeAffineVelocity(field, obj);
    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('derives velocity from the world-transform translation delta between frames', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeAffineVelocity(field, obj);
    obj.x = 7;
    obj.y = -3;
    invalidateNodeLocalTransform(obj);
    beginVelocityFrame(field);
    contributeAffineVelocity(field, obj);
    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 7, y: -3 });
  });

  it('lets an explicit contribution override the derived delta regardless of call order', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeAffineVelocity(field, obj);
    obj.x = 100;
    invalidateNodeLocalTransform(obj);
    beginVelocityFrame(field);
    contributeVelocity(field, obj, 5, 5);
    contributeAffineVelocity(field, obj);
    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 5, y: 5 });
  });

  it('still updates previousWorldTransform when an explicit override is in effect', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeAffineVelocity(field, obj);
    obj.x = 10;
    invalidateNodeLocalTransform(obj);
    beginVelocityFrame(field);
    contributeVelocity(field, obj, 99, 99);
    contributeAffineVelocity(field, obj);
    // On the third frame with no explicit override, previousWorldTransform should reflect frame 2 position.
    beginVelocityFrame(field);
    contributeAffineVelocity(field, obj);
    // No movement between frame 2 and frame 3 — velocity should be zero.
    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('getVelocitySampleAt', () => {
  it('returns zero when the sample has no previousWorldTransform', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    const out = { x: 99, y: 99 };
    getVelocitySampleAt(sample, identity, 0, 0, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('returns translation delta at the origin when transform is translation-only', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    // Previous: translate(3, 4), Current: translate(8, 9) — delta = (5, 5) for any point.
    sample.previousWorldTransform = createMatrix(1, 0, 0, 1, 3, 4);
    const current = { a: 1, b: 0, c: 0, d: 1, tx: 8, ty: 9 };
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, current, 0, 0, out);
    expect(out).toEqual({ x: 5, y: 5 });
  });

  it('computes affine reprojection for a non-origin point', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    // Both previous and current are pure translations but we query a non-origin point.
    // The affine result for p=(1,0) with translate-only matrices is still just the tx/ty delta.
    sample.previousWorldTransform = createMatrix(1, 0, 0, 1, 0, 0);
    const current = { a: 1, b: 0, c: 0, d: 1, tx: 2, ty: 3 };
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, current, 1, 0, out);
    expect(out).toEqual({ x: 2, y: 3 });
  });

  it('computes correct velocity for a rotating transform at a non-origin point', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    // Previous = identity, current = 90-degree rotation (cos=0, sin=1, no translation).
    // p=(1,0): previous maps to (1,0), current maps to (0,1). delta = (-1,1).
    sample.previousWorldTransform = createMatrix(1, 0, 0, 1, 0, 0);
    const rotated90 = { a: 0, b: 1, c: -1, d: 0, tx: 0, ty: 0 };
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, rotated90, 1, 0, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(1);
  });

  it('is alias-safe when out references a different object (basic alias check)', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    sample.previousWorldTransform = createMatrix(1, 0, 0, 1, 1, 2);
    const current = { a: 1, b: 0, c: 0, d: 1, tx: 4, ty: 6 };
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, current, 0, 0, out);
    expect(out).toEqual({ x: 3, y: 4 });
  });
});
