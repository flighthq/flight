import { describe, expect, it } from 'vitest';

import {
  clearRigidBody3DForces,
  integrateRigidBody3DPose,
  integrateRigidBody3DVelocity,
  refreshRigidBody3DWorldInertia,
} from './integrate';
import {
  computePhysics3DBoxMassData,
  computePhysics3DSphereMassData,
  createPhysics3DMassData,
  setRigidBody3DMassData,
} from './massProperties';
import { createRigidBody3D } from './world';

describe('clearRigidBody3DForces', () => {
  it('zeroes both accumulators', () => {
    const body = createRigidBody3D();
    body.forceX = 1;
    body.torqueZ = 2;

    clearRigidBody3DForces(body);

    expect(body.forceX).toBe(0);
    expect(body.torqueZ).toBe(0);
  });
});

describe('integrateRigidBody3DPose', () => {
  it('advances position by the current velocity', () => {
    const body = dynamicSphere();
    body.velocityX = 3;

    integrateRigidBody3DPose(body, 0.5);

    expect(body.x).toBeCloseTo(1.5, 12);
  });

  it('leaves a static body alone', () => {
    const body = createRigidBody3D('static');
    body.velocityX = 3;

    integrateRigidBody3DPose(body, 0.5);

    expect(body.x).toBe(0);
  });

  it('leaves a sleeping body alone', () => {
    const body = dynamicSphere();
    body.sleeping = true;
    body.velocityX = 3;

    integrateRigidBody3DPose(body, 0.5);

    expect(body.x).toBe(0);
  });

  it('rotates about the angular velocity axis by its magnitude times dt', () => {
    const body = dynamicSphere();
    body.angularVelocityZ = Math.PI; // half a turn per second

    // One second of five-millisecond steps is half a turn, so the z component reaches sin(pi/2) and w
    // reaches cos(pi/2). The step size matters: normalizing after a tangent move rotates by
    // `2*atan(h)` rather than `2h`, so each step under-rotates by about `2h^3/3` and a coarse dt turns
    // a correct integrator into a visibly slow one.
    for (let i = 0; i < 200; i++) integrateRigidBody3DPose(body, 0.005);

    expect(body.orientationZ).toBeCloseTo(Math.sin(Math.PI / 2), 3);
    expect(body.orientationW).toBeCloseTo(Math.cos(Math.PI / 2), 3);
  });

  it('keeps the quaternion normalized across many steps', () => {
    const body = dynamicSphere();
    body.angularVelocityX = 5;
    body.angularVelocityY = -3;
    body.angularVelocityZ = 2;

    for (let i = 0; i < 2000; i++) integrateRigidBody3DPose(body, 1 / 60);

    const length = Math.hypot(body.orientationX, body.orientationY, body.orientationZ, body.orientationW);
    expect(length).toBeCloseTo(1, 10);
  });

  it('leaves the orientation untouched at zero angular velocity', () => {
    const body = dynamicSphere();
    body.velocityY = 1;

    integrateRigidBody3DPose(body, 0.5);

    expect(body.orientationW).toBe(1);
    expect(body.orientationX).toBe(0);
  });

  it('holds the previous orientation rather than writing NaN for a diverged angular velocity', () => {
    const body = dynamicSphere();
    body.angularVelocityX = Number.POSITIVE_INFINITY;

    integrateRigidBody3DPose(body, 1 / 60);

    expect(Number.isNaN(body.orientationW)).toBe(false);
    expect(body.orientationW).toBe(1);
  });
});

describe('integrateRigidBody3DVelocity', () => {
  it('accelerates under gravity', () => {
    const body = dynamicSphere();

    integrateRigidBody3DVelocity(body, 0, -10, 0, 0.5);

    expect(body.velocityY).toBeCloseTo(-5, 12);
  });

  it('scales gravity per body', () => {
    const body = dynamicSphere();
    body.gravityScale = 0;

    integrateRigidBody3DVelocity(body, 0, -10, 0, 0.5);

    expect(body.velocityY).toBe(0);
  });

  it('converts force to velocity through the inverse mass', () => {
    const body = dynamicSphere();
    body.forceX = body.mass * 4;

    integrateRigidBody3DVelocity(body, 0, 0, 0, 0.5);

    expect(body.velocityX).toBeCloseTo(2, 10);
  });

  it('leaves a kinematic body alone — it is driven by the caller', () => {
    const body = createRigidBody3D('kinematic');
    body.velocityY = 7;

    integrateRigidBody3DVelocity(body, 0, -10, 0, 0.5);

    expect(body.velocityY).toBe(7);
  });

  it('damps linear velocity toward zero without crossing it at a large step', () => {
    const body = dynamicSphere();
    body.velocityX = 10;
    body.linearDamping = 50;

    integrateRigidBody3DVelocity(body, 0, 0, 0, 10);

    expect(body.velocityX).toBeGreaterThan(0);
    expect(body.velocityX).toBeLessThan(10);
  });

  it('leaves a sphere spinning about a fixed axis — its gyroscopic term vanishes', () => {
    // A sphere's inertia is isotropic, so `omega x (I * omega)` is a vector crossed with a multiple of
    // itself: exactly zero. Any drift here is the gyroscopic term being computed wrongly.
    const body = dynamicSphere();
    body.angularVelocityX = 2;
    body.angularVelocityY = 3;

    for (let i = 0; i < 100; i++) {
      refreshRigidBody3DWorldInertia(body);
      integrateRigidBody3DVelocity(body, 0, 0, 0, 1 / 60);
      integrateRigidBody3DPose(body, 1 / 60);
    }

    expect(body.angularVelocityX).toBeCloseTo(2, 8);
    expect(body.angularVelocityY).toBeCloseTo(3, 8);
    expect(body.angularVelocityZ).toBeCloseTo(0, 8);
  });

  it('tumbles an asymmetric body spun off-axis, which is what the gyroscopic term is for', () => {
    // A long box spun about an axis that is not principal must transfer angular velocity between axes.
    // A solver missing `omega x (I * omega)` holds all three components fixed forever.
    const body = createRigidBody3D();
    const data = createPhysics3DMassData();
    computePhysics3DBoxMassData(4, 1, 0.5, 1, data);
    setRigidBody3DMassData(body, data);
    refreshRigidBody3DWorldInertia(body);
    body.angularVelocityX = 5;
    body.angularVelocityY = 0.2;

    for (let i = 0; i < 200; i++) {
      refreshRigidBody3DWorldInertia(body);
      integrateRigidBody3DVelocity(body, 0, 0, 0, 1 / 240);
      integrateRigidBody3DPose(body, 1 / 240);
    }

    expect(Math.abs(body.angularVelocityZ)).toBeGreaterThan(1e-4);
  });

  it('applies torque about the axis it is given for an isotropic body', () => {
    const body = dynamicSphere();
    refreshRigidBody3DWorldInertia(body);
    body.torqueZ = body.inertiaZZ * 4;

    integrateRigidBody3DVelocity(body, 0, 0, 0, 0.5);

    expect(body.angularVelocityZ).toBeCloseTo(2, 8);
    expect(body.angularVelocityX).toBeCloseTo(0, 10);
  });
});

describe('refreshRigidBody3DWorldInertia', () => {
  it('matches the local tensor at identity orientation', () => {
    const body = dynamicSphere();

    refreshRigidBody3DWorldInertia(body);

    expect(body.inverseInertiaWorldXX).toBeCloseTo(body.inverseInertiaXX, 12);
  });

  it('swaps the x and y world moments for a body turned a quarter turn about z', () => {
    const body = createRigidBody3D();
    const data = createPhysics3DMassData();
    computePhysics3DBoxMassData(4, 1, 1, 1, data);
    setRigidBody3DMassData(body, data);
    const half = Math.SQRT1_2;
    body.orientationZ = half;
    body.orientationW = half;

    refreshRigidBody3DWorldInertia(body);

    expect(body.inverseInertiaWorldXX).toBeCloseTo(body.inverseInertiaYY, 8);
    expect(body.inverseInertiaWorldYY).toBeCloseTo(body.inverseInertiaXX, 8);
  });

  it('leaves an immovable body world tensor at zero', () => {
    const body = createRigidBody3D('static');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);
    setRigidBody3DMassData(body, data);
    body.orientationZ = Math.SQRT1_2;
    body.orientationW = Math.SQRT1_2;

    refreshRigidBody3DWorldInertia(body);

    expect(body.inverseInertiaWorldXX).toBe(0);
    expect(body.inverseInertiaWorldYY).toBe(0);
  });
});

function dynamicSphere(): ReturnType<typeof createRigidBody3D> {
  const body = createRigidBody3D();
  const data = createPhysics3DMassData();
  computePhysics3DSphereMassData(1, 1, data);
  setRigidBody3DMassData(body, data);
  refreshRigidBody3DWorldInertia(body);
  return body;
}
