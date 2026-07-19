import { describe, expect, it } from 'vitest';

import { createMatrix4 } from './matrix4';
import { createQuaternion } from './quaternion';
import { composeMatrix4FromTransform3D, createTransform3D, decomposeMatrix4ToTransform3D } from './transform3d';
import { createVector3 } from './vector3';

describe('composeMatrix4FromTransform3D', () => {
  it('composes translation, rotation, and scale into a matrix', () => {
    const t = createTransform3D();
    t.translation = createVector3(4, 5, 6);
    t.scale = createVector3(2, 2, 2);
    const out = createMatrix4();
    composeMatrix4FromTransform3D(out, t);
    // Identity rotation + uniform scale 2 + translation (4,5,6): diagonal scale, last column translation.
    expect(out.m[0]).toBeCloseTo(2);
    expect(out.m[5]).toBeCloseTo(2);
    expect(out.m[10]).toBeCloseTo(2);
    expect(out.m[12]).toBeCloseTo(4);
    expect(out.m[13]).toBeCloseTo(5);
    expect(out.m[14]).toBeCloseTo(6);
  });
});

describe('createTransform3D', () => {
  it('defaults to identity: zero translation, identity rotation, unit scale', () => {
    const t = createTransform3D();
    expect(t.translation).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(t.rotation).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(t.scale).toMatchObject({ x: 1, y: 1, z: 1 });
  });
});

describe('decomposeMatrix4ToTransform3D', () => {
  it('round-trips a shear-free compose', () => {
    const source = createTransform3D();
    source.translation = createVector3(1, 2, 3);
    source.rotation = createQuaternion(0, 0, 0, 1);
    source.scale = createVector3(2, 3, 4);
    const m = createMatrix4();
    composeMatrix4FromTransform3D(m, source);

    const out = createTransform3D();
    decomposeMatrix4ToTransform3D(out, m);
    expect(out.translation).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(out.scale.x).toBeCloseTo(2);
    expect(out.scale.y).toBeCloseTo(3);
    expect(out.scale.z).toBeCloseTo(4);
  });
});
