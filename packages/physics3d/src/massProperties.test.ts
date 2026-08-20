import type { RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  combinePhysics3DMassData,
  computePhysics3DBoxMassData,
  computePhysics3DCapsuleMassData,
  computePhysics3DSphereMassData,
  createPhysics3DMassData,
  setRigidBody3DMassData,
} from './massProperties';

describe('combinePhysics3DMassData', () => {
  it('starts from the zero identity, adopting the addend outright', () => {
    const target = createPhysics3DMassData();
    const sphere = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, sphere);

    combinePhysics3DMassData(target, sphere);

    expect(target.mass).toBeCloseTo(sphere.mass, 12);
    expect(target.inertiaXX).toBeCloseTo(sphere.inertiaXX, 12);
  });

  it('puts the combined centre between two equal masses', () => {
    const target = createPhysics3DMassData();
    const left = createPhysics3DMassData();
    const right = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, left);
    computePhysics3DSphereMassData(1, 1, right);
    left.centerX = -2;
    right.centerX = 2;

    combinePhysics3DMassData(target, left);
    combinePhysics3DMassData(target, right);

    expect(target.centerX).toBeCloseTo(0, 12);
    expect(target.mass).toBeCloseTo(left.mass + right.mass, 12);
  });

  it('shifts the ALREADY-ACCUMULATED tensor too, not only the addend', () => {
    // Two unit spheres offset along x. About the combined centre, each contributes its own moment plus
    // mass * d^2 for the y and z axes. A version that shifted only the addend would report half of it.
    const target = createPhysics3DMassData();
    const left = createPhysics3DMassData();
    const right = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, left);
    computePhysics3DSphereMassData(1, 1, right);
    left.centerX = -2;
    right.centerX = 2;

    combinePhysics3DMassData(target, left);
    combinePhysics3DMassData(target, right);

    const each = left.mass;
    const expectedYY = 2 * (0.4 * each * 1 + each * 4);
    expect(target.inertiaYY).toBeCloseTo(expectedYY, 8);
    // The x axis runs through both centres, so it gains no parallel-axis term.
    expect(target.inertiaXX).toBeCloseTo(2 * 0.4 * each, 8);
  });

  it('is order-independent for the combined mass and centre', () => {
    const forward = createPhysics3DMassData();
    const backward = createPhysics3DMassData();
    const a = createPhysics3DMassData();
    const b = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, a);
    computePhysics3DBoxMassData(1, 2, 3, 2, b);
    a.centerY = 1;
    b.centerY = -3;

    combinePhysics3DMassData(forward, a);
    combinePhysics3DMassData(forward, b);
    combinePhysics3DMassData(backward, b);
    combinePhysics3DMassData(backward, a);

    expect(backward.mass).toBeCloseTo(forward.mass, 10);
    expect(backward.centerY).toBeCloseTo(forward.centerY, 10);
    expect(backward.inertiaXX).toBeCloseTo(forward.inertiaXX, 8);
  });

  it('zeroes the result when both sides are massless rather than dividing by zero', () => {
    const target = createPhysics3DMassData();
    combinePhysics3DMassData(target, createPhysics3DMassData());
    expect(target.mass).toBe(0);
    expect(Number.isNaN(target.centerX)).toBe(false);
  });
});

describe('computePhysics3DBoxMassData', () => {
  it('derives mass from volume and density', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(1, 2, 3, 5, out);
    expect(out.mass).toBeCloseTo(8 * 1 * 2 * 3 * 5, 10);
  });

  it('gives a cube one moment on every axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(2, 2, 2, 1, out);
    expect(out.inertiaYY).toBeCloseTo(out.inertiaXX, 10);
    expect(out.inertiaZZ).toBeCloseTo(out.inertiaXX, 10);
  });

  it('resists rotation least about its longest axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(4, 1, 1, 1, out);
    expect(out.inertiaXX).toBeLessThan(out.inertiaYY);
    expect(out.inertiaYY).toBeCloseTo(out.inertiaZZ, 10);
  });

  it('leaves the off-diagonal terms zero for an axis-aligned box', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(1, 2, 3, 1, out);
    expect(out.inertiaXY).toBe(0);
    expect(out.inertiaXZ).toBe(0);
    expect(out.inertiaYZ).toBe(0);
  });
});

describe('computePhysics3DCapsuleMassData', () => {
  it('degenerates exactly to a sphere at zero half-height', () => {
    const capsule = createPhysics3DMassData();
    const sphere = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(2, 0, 3, capsule);
    computePhysics3DSphereMassData(2, 3, sphere);

    expect(capsule.mass).toBeCloseTo(sphere.mass, 10);
    expect(capsule.inertiaXX).toBeCloseTo(sphere.inertiaXX, 8);
    expect(capsule.inertiaYY).toBeCloseTo(sphere.inertiaYY, 8);
    expect(capsule.inertiaZZ).toBeCloseTo(sphere.inertiaZZ, 8);
  });

  it('derives mass as cylinder plus two hemispheres', () => {
    const out = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(1, 2, 1, out);
    const expected = Math.PI * 1 * 4 + (4 / 3) * Math.PI * 1;
    expect(out.mass).toBeCloseTo(expected, 10);
  });

  it('resists rotation least about its own axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(1, 4, 1, out);
    expect(out.inertiaYY).toBeLessThan(out.inertiaXX);
  });

  it('is symmetric across the two axes orthogonal to its own', () => {
    const out = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(1.5, 3, 2, out);
    expect(out.inertiaZZ).toBeCloseTo(out.inertiaXX, 10);
  });
});

describe('computePhysics3DSphereMassData', () => {
  it('derives mass from volume and density', () => {
    const out = createPhysics3DMassData();
    computePhysics3DSphereMassData(2, 3, out);
    expect(out.mass).toBeCloseTo((4 / 3) * Math.PI * 8 * 3, 10);
  });

  it('uses the two-fifths moment on every axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DSphereMassData(2, 3, out);
    expect(out.inertiaXX).toBeCloseTo(0.4 * out.mass * 4, 10);
    expect(out.inertiaYY).toBeCloseTo(out.inertiaXX, 12);
    expect(out.inertiaZZ).toBeCloseTo(out.inertiaXX, 12);
  });
});

describe('createPhysics3DMassData', () => {
  it('is the additive identity — all zero', () => {
    const out = createPhysics3DMassData();
    expect(out.mass).toBe(0);
    expect(out.inertiaXX).toBe(0);
    expect(out.centerZ).toBe(0);
  });
});

describe('setRigidBody3DMassData', () => {
  it('derives the inverse mass and a non-zero inverse tensor for a dynamic body', () => {
    const body = testBody('dynamic');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.mass).toBeCloseTo(data.mass, 12);
    expect(body.inverseMass).toBeCloseTo(1 / data.mass, 10);
    expect(body.inverseInertiaXX).toBeCloseTo(1 / data.inertiaXX, 8);
  });

  it('gives a static body zero inverse mass and zero inverse inertia while keeping the forward values', () => {
    const body = testBody('static');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.mass).toBeCloseTo(data.mass, 12);
    expect(body.inverseMass).toBe(0);
    expect(body.inverseInertiaXX).toBe(0);
  });

  it('gives a kinematic body the same zero inverses as a static one', () => {
    const body = testBody('kinematic');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.inverseMass).toBe(0);
    expect(body.inverseInertiaZZ).toBe(0);
  });

  it('zeroes only the inverse inertia for a fixed-rotation dynamic body, keeping its inverse mass', () => {
    const body = testBody('dynamic');
    body.fixedRotation = true;
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.inverseMass).toBeGreaterThan(0);
    expect(body.inverseInertiaXX).toBe(0);
    expect(body.inverseInertiaYY).toBe(0);
  });

  it('treats a zero-mass dynamic body as immovable rather than dividing by zero', () => {
    const body = testBody('dynamic');

    setRigidBody3DMassData(body, createPhysics3DMassData());

    expect(body.inverseMass).toBe(0);
    expect(body.inverseInertiaXX).toBe(0);
  });

  it('copies the centre of mass onto the body', () => {
    const body = testBody('dynamic');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);
    data.centerY = 4;

    setRigidBody3DMassData(body, data);

    expect(body.centerY).toBe(4);
  });
});

function testBody(type: RigidBody3D['type']): RigidBody3D {
  return {
    index: 0,
    type,
    x: 0,
    y: 0,
    z: 0,
    orientationX: 0,
    orientationY: 0,
    orientationZ: 0,
    orientationW: 1,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    angularVelocityX: 0,
    angularVelocityY: 0,
    angularVelocityZ: 0,
    forceX: 0,
    forceY: 0,
    forceZ: 0,
    torqueX: 0,
    torqueY: 0,
    torqueZ: 0,
    mass: 0,
    inverseMass: 0,
    inverseInertiaXX: 0,
    inverseInertiaYY: 0,
    inverseInertiaZZ: 0,
    inverseInertiaXY: 0,
    inverseInertiaXZ: 0,
    inverseInertiaYZ: 0,
    inverseInertiaWorldXX: 0,
    inverseInertiaWorldYY: 0,
    inverseInertiaWorldZZ: 0,
    inverseInertiaWorldXY: 0,
    inverseInertiaWorldXZ: 0,
    inverseInertiaWorldYZ: 0,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    linearDamping: 0,
    angularDamping: 0,
    gravityScale: 1,
    fixedRotation: false,
    bullet: false,
    sleeping: false,
    sleepEnabled: true,
    sleepTimer: 0,
    material: { density: 1, friction: 0.2, restitution: 0 },
    filter: { categoryBits: 1, maskBits: 0xffff, groupIndex: 0 },
  };
}
