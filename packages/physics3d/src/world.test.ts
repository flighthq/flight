import type { Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { isPhysics3DPairJointSuppressed } from './jointCollisionSuppression';
import { createPhysics3DBallAndSocketJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import { computePhysics3DSphereMassData, createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import {
  addPhysics3DBody,
  applyPhysics3DForce,
  applyPhysics3DForceAtPoint,
  applyPhysics3DLinearImpulse,
  applyPhysics3DTorque,
  createPhysics3DSequentialImpulseConfig,
  createPhysics3DSolverConfig,
  createPhysics3DWorld,
  createRigidBody3D,
  findPhysics3DBody,
  Physics3DWorldVersion,
  removePhysics3DBody,
  setPhysics3DBodyFixedRotation,
  setPhysics3DBodyTransform,
  setPhysics3DBodyType,
  wakePhysics3DBody,
  writeRigidBody3DWorldCenter,
} from './world';

describe('addPhysics3DBody', () => {
  it('assigns a persistent index and registers the body', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D();

    const index = addPhysics3DBody(world, body);

    expect(index).toBe(0);
    expect(world.bodies).toContain(body);
    expect(findPhysics3DBody(world, index)).toBe(body);
  });

  it('never reissues an index a removed body held', () => {
    const world = createPhysics3DWorld();
    const first = createRigidBody3D();
    addPhysics3DBody(world, first);
    removePhysics3DBody(world, first);

    const second = createRigidBody3D();
    const index = addPhysics3DBody(world, second);

    expect(index).not.toBe(first.index);
    expect(findPhysics3DBody(world, first.index)).toBeNull();
  });

  it('is idempotent for a body already in the world', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D();
    const first = addPhysics3DBody(world, body);

    const second = addPhysics3DBody(world, body);

    expect(second).toBe(first);
    expect(world.bodies).toHaveLength(1);
  });
});

describe('applyPhysics3DForce', () => {
  it('accumulates onto the force vector and wakes the body', () => {
    const body = sphere();
    body.sleeping = true;

    applyPhysics3DForce(body, 1, 2, 3);

    expect(body.forceY).toBe(2);
    expect(body.sleeping).toBe(false);
  });

  it('ignores a static body', () => {
    const body = createRigidBody3D('static');
    applyPhysics3DForce(body, 1, 2, 3);
    expect(body.forceY).toBe(0);
  });
});

describe('applyPhysics3DForceAtPoint', () => {
  it('produces torque from the lever arm', () => {
    const body = sphere();

    // Push along +x at a point one unit along +y: the torque is about -z.
    applyPhysics3DForceAtPoint(body, 1, 0, 0, 0, 1, 0);

    expect(body.forceX).toBe(1);
    expect(body.torqueZ).toBeCloseTo(-1, 12);
  });

  it('produces no torque for a force through the centre of mass', () => {
    const body = sphere();

    applyPhysics3DForceAtPoint(body, 5, 0, 0, 0, 0, 0);

    expect(body.torqueX).toBeCloseTo(0, 12);
    expect(body.torqueY).toBeCloseTo(0, 12);
    expect(body.torqueZ).toBeCloseTo(0, 12);
  });

  it('measures the lever arm from the centre of mass, not the origin', () => {
    const body = sphere();
    body.centerY = 1;

    // The same point is now AT the centre of mass, so it can produce no torque.
    applyPhysics3DForceAtPoint(body, 1, 0, 0, 0, 1, 0);

    expect(body.torqueZ).toBeCloseTo(0, 12);
  });
});

describe('applyPhysics3DLinearImpulse', () => {
  it('changes velocity immediately through the inverse mass', () => {
    const body = sphere();

    applyPhysics3DLinearImpulse(body, body.mass * 3, 0, 0);

    expect(body.velocityX).toBeCloseTo(3, 10);
  });

  it('ignores an immovable body', () => {
    const body = createRigidBody3D('static');
    applyPhysics3DLinearImpulse(body, 100, 0, 0);
    expect(body.velocityX).toBe(0);
  });
});

describe('applyPhysics3DTorque', () => {
  it('accumulates onto the torque vector', () => {
    const body = sphere();
    applyPhysics3DTorque(body, 0, 0, 4);
    expect(body.torqueZ).toBe(4);
  });
});

describe('createPhysics3DSequentialImpulseConfig', () => {
  it('defaults to warm starting on', () => {
    expect(createPhysics3DSequentialImpulseConfig().warmStarting).toBe(true);
  });

  it('gives more velocity iterations than position iterations', () => {
    const config = createPhysics3DSequentialImpulseConfig();
    expect(config.velocityIterations).toBeGreaterThan(config.positionIterations);
  });
});

describe('createPhysics3DSolverConfig', () => {
  it('defaults substeps to one, reproducing a single discrete step', () => {
    expect(createPhysics3DSolverConfig().substeps).toBe(1);
  });

  it('carries the sequential-impulse block as a named sibling rather than flattened', () => {
    const config = createPhysics3DSolverConfig();
    expect(config.sequentialImpulse.velocityIterations).toBeGreaterThan(0);
    expect((config as unknown as Record<string, unknown>).velocityIterations).toBeUndefined();
  });
});

describe('createPhysics3DWorld', () => {
  it('starts empty at the current version', () => {
    const world = createPhysics3DWorld();
    expect(world.version).toBe(Physics3DWorldVersion);
    expect(world.bodies).toHaveLength(0);
    expect(world.contacts).toHaveLength(0);
  });

  it('defaults gravity to earth along -Y', () => {
    const world = createPhysics3DWorld();
    expect(world.gravityY).toBeLessThan(0);
    expect(world.gravityX).toBe(0);
    expect(world.gravityZ).toBe(0);
  });

  it('gives each world its own joint solver registry', () => {
    const a = createPhysics3DWorld();
    const b = createPhysics3DWorld();
    a.jointSolvers.set('acme.Test', { prepare: () => {}, solve: () => {} });
    expect(b.jointSolvers.has('acme.Test')).toBe(false);
  });
});

describe('createRigidBody3D', () => {
  it('starts at rest at the origin with an identity orientation', () => {
    const body = createRigidBody3D();
    expect(body.orientationW).toBe(1);
    expect(body.velocityX).toBe(0);
    expect(body.x).toBe(0);
  });

  it('is immovable until given mass', () => {
    expect(createRigidBody3D().inverseMass).toBe(0);
  });

  it('defaults to dynamic', () => {
    expect(createRigidBody3D().type).toBe('dynamic');
  });
});

describe('findPhysics3DBody', () => {
  it('returns null for an unknown index rather than throwing', () => {
    expect(findPhysics3DBody(createPhysics3DWorld(), 99)).toBeNull();
  });
});

describe('removePhysics3DBody', () => {
  it('releases the ownership of every joint it drops', () => {
    const world = createPhysics3DWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const anchor = createRigidBody3D('dynamic');
    const hanging = createRigidBody3D('dynamic');
    addPhysics3DBody(world, anchor);
    addPhysics3DBody(world, hanging);
    const joint = addPhysics3DJoint(
      world,
      createPhysics3DBallAndSocketJoint({ bodyA: anchor.index, bodyB: hanging.index }),
    );

    removePhysics3DBody(world, hanging);

    // A joint dropped here leaves by the same exits `removePhysics3DJoint` uses. Splicing it out of the
    // array alone leaves a joint that no world holds but that every world still refuses to accept.
    expect(world.joints).toEqual([]);
    expect(() => addPhysics3DJoint(world, joint)).not.toThrow();
  });

  it('stops suppressing a pair whose joint it just dropped', () => {
    const world = createPhysics3DWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const first = createRigidBody3D('dynamic');
    const second = createRigidBody3D('dynamic');
    addPhysics3DBody(world, first);
    addPhysics3DBody(world, second);
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: first.index, bodyB: second.index }));
    expect(isPhysics3DPairJointSuppressed(world, first.index, second.index)).toBe(true);

    removePhysics3DBody(world, second);

    // Leaving the index behind suppresses a pair against a joint that no longer exists, which reads as a
    // contact that silently never reports.
    expect(isPhysics3DPairJointSuppressed(world, first.index, second.index)).toBe(false);
  });

  it('reports false for a body that is not in the world', () => {
    expect(removePhysics3DBody(createPhysics3DWorld(), createRigidBody3D())).toBe(false);
  });

  it('drops contacts that named the removed body', () => {
    const world = createPhysics3DWorld();
    const a = createRigidBody3D();
    const b = createRigidBody3D();
    addPhysics3DBody(world, a);
    addPhysics3DBody(world, b);
    world.contacts.push(contact(a.index, b.index));

    removePhysics3DBody(world, a);

    expect(world.contacts).toHaveLength(0);
  });

  it('drops joints that named the removed body', () => {
    const world = createPhysics3DWorld();
    const a = createRigidBody3D();
    const b = createRigidBody3D();
    addPhysics3DBody(world, a);
    addPhysics3DBody(world, b);
    world.joints.push({
      kind: 'Physics3DBallJoint',
      bodyA: a.index,
      bodyB: b.index,
      localAnchorAX: 0,
      localAnchorAY: 0,
      localAnchorAZ: 0,
      localAnchorBX: 0,
      localAnchorBY: 0,
      localAnchorBZ: 0,
      collideConnected: false,
      impulse0: 0,
      impulse1: 0,
      impulse2: 0,
      impulse3: 0,
      impulse4: 0,
      impulse5: 0,
      rAX: 0,
      rAY: 0,
      rAZ: 0,
      rBX: 0,
      rBY: 0,
      rBZ: 0,
    });

    removePhysics3DBody(world, b);

    expect(world.joints).toHaveLength(0);
  });

  it('leaves unrelated contacts in place', () => {
    const world = createPhysics3DWorld();
    const a = createRigidBody3D();
    const b = createRigidBody3D();
    const c = createRigidBody3D();
    addPhysics3DBody(world, a);
    addPhysics3DBody(world, b);
    addPhysics3DBody(world, c);
    world.contacts.push(contact(b.index, c.index));

    removePhysics3DBody(world, a);

    expect(world.contacts).toHaveLength(1);
  });
});

describe('setPhysics3DBodyFixedRotation', () => {
  it('zeroes the inverse inertia and clears angular velocity while keeping inverse mass', () => {
    const body = sphere();
    body.angularVelocityZ = 5;

    setPhysics3DBodyFixedRotation(body, true);

    expect(body.inverseInertiaXX).toBe(0);
    expect(body.angularVelocityZ).toBe(0);
    expect(body.inverseMass).toBeGreaterThan(0);
  });

  it('restores the inverse inertia from the stored forward tensor when released', () => {
    const body = sphere();
    const before = body.inverseInertiaXX;
    setPhysics3DBodyFixedRotation(body, true);

    setPhysics3DBodyFixedRotation(body, false);

    expect(body.inverseInertiaXX).toBeCloseTo(before, 10);
  });
});

describe('setPhysics3DBodyTransform', () => {
  it('moves the body and refreshes the world inertia', () => {
    const body = sphere();

    setPhysics3DBodyTransform(body, 1, 2, 3, 0, 0, 0, 1);

    expect(body.y).toBe(2);
    expect(body.inverseInertiaWorldXX).toBeCloseTo(body.inverseInertiaXX, 10);
  });

  it('normalizes a quaternion it is handed unnormalized', () => {
    const body = sphere();

    setPhysics3DBodyTransform(body, 0, 0, 0, 0, 0, 3, 3);

    const length = Math.hypot(body.orientationX, body.orientationY, body.orientationZ, body.orientationW);
    expect(length).toBeCloseTo(1, 12);
  });

  it('falls back to identity for a zero quaternion rather than dividing by zero', () => {
    const body = sphere();

    setPhysics3DBodyTransform(body, 0, 0, 0, 0, 0, 0, 0);

    expect(body.orientationW).toBe(1);
  });

  it('wakes the body', () => {
    const body = sphere();
    body.sleeping = true;

    setPhysics3DBodyTransform(body, 1, 0, 0, 0, 0, 0, 1);

    expect(body.sleeping).toBe(false);
  });
});

describe('setPhysics3DBodyType', () => {
  it('makes a dynamic body immovable when it becomes static', () => {
    const body = sphere();
    body.velocityX = 5;

    setPhysics3DBodyType(body, 'static');

    expect(body.inverseMass).toBe(0);
    expect(body.velocityX).toBe(0);
  });

  it('restores the inverse mass and inertia when a static body becomes dynamic again', () => {
    const body = sphere();
    const mass = body.inverseMass;
    const inertia = body.inverseInertiaXX;
    setPhysics3DBodyType(body, 'static');

    setPhysics3DBodyType(body, 'dynamic');

    expect(body.inverseMass).toBeCloseTo(mass, 10);
    expect(body.inverseInertiaXX).toBeCloseTo(inertia, 10);
  });

  it('keeps velocity when a kinematic body becomes dynamic', () => {
    const body = createRigidBody3D('kinematic');
    body.velocityX = 4;

    setPhysics3DBodyType(body, 'dynamic');

    expect(body.velocityX).toBe(4);
  });

  it('clears the force accumulators on any change', () => {
    const body = sphere();
    body.forceX = 9;

    setPhysics3DBodyType(body, 'kinematic');

    expect(body.forceX).toBe(0);
  });

  it('is a no-op for the type it already has', () => {
    const body = sphere();
    body.forceX = 9;

    setPhysics3DBodyType(body, 'dynamic');

    expect(body.forceX).toBe(9);
  });
});

describe('wakePhysics3DBody', () => {
  it('clears the sleep flag and timer', () => {
    const body = sphere();
    body.sleeping = true;
    body.sleepTimer = 3;

    wakePhysics3DBody(body);

    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
  });

  it('is a no-op for a static body, which is neither awake nor asleep', () => {
    const body = createRigidBody3D('static');
    body.sleepTimer = 3;

    wakePhysics3DBody(body);

    expect(body.sleepTimer).toBe(3);
  });
});

describe('writeRigidBody3DWorldCenter', () => {
  it('returns the position when the centre of mass is the origin', () => {
    const body = sphere();
    body.x = 1;
    body.y = 2;
    body.z = 3;
    const out = [0, 0, 0];

    writeRigidBody3DWorldCenter(body, out);

    expect(out).toEqual([1, 2, 3]);
  });

  it('offsets by the local centre at identity orientation', () => {
    const body = sphere();
    body.x = 1;
    body.centerY = 2;
    const out = [0, 0, 0];

    writeRigidBody3DWorldCenter(body, out);

    expect(out[0]).toBeCloseTo(1, 12);
    expect(out[1]).toBeCloseTo(2, 12);
  });

  it('rotates the local centre by the body orientation', () => {
    const body = sphere();
    body.centerX = 1;
    // A quarter turn about z carries local +x onto world +y.
    body.orientationZ = Math.SQRT1_2;
    body.orientationW = Math.SQRT1_2;
    const out = [0, 0, 0];

    writeRigidBody3DWorldCenter(body, out);

    expect(out[0]).toBeCloseTo(0, 10);
    expect(out[1]).toBeCloseTo(1, 10);
  });
});

function contact(bodyA: number, bodyB: number): Physics3DWorld['contacts'][number] {
  return {
    bodyA,
    bodyB,
    colliderA: 0,
    colliderB: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    pointCount: 0,
    points: [],
    friction: 0.2,
    restitution: 0,
    enabled: true,
    sensor: false,
    touching: true,
  };
}

function sphere(): RigidBody3D {
  const body = createRigidBody3D();
  const data = createPhysics3DMassData();
  computePhysics3DSphereMassData(1, 1, data);
  setRigidBody3DMassData(body, data);
  return body;
}
