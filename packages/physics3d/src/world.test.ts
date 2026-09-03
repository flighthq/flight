import {
  createCollisionHeightfield3D,
  createCollisionTriangleMesh3D,
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { CollisionBuiltInShape3D, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildPhysics3DContacts } from './contactIntake';
import { createPhysics3DContact } from './contacts';
import { isPhysics3DPairJointSuppressed } from './jointCollisionSuppression';
import { createPhysics3DBallAndSocketJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import { computePhysics3DSphereMassData, createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  applyPhysics3DForce,
  applyPhysics3DForceAtPoint,
  applyPhysics3DLinearImpulse,
  applyPhysics3DLinearImpulseAtPoint,
  applyPhysics3DTorque,
  createPhysics3DCollider,
  createPhysics3DSequentialImpulseConfig,
  createPhysics3DSolverConfig,
  createPhysics3DWorld,
  createRigidBody3D,
  findPhysics3DBody,
  hydratePhysics3DWorld,
  invalidatePhysics3DCollider,
  Physics3DWorldVersion,
  removePhysics3DBody,
  removePhysics3DCollider,
  setPhysics3DBodyBullet,
  setPhysics3DBodyFixedRotation,
  setPhysics3DBodySleepEnabled,
  setPhysics3DBodyTransform,
  setPhysics3DBodyType,
  wakePhysics3DBody,
  writeRigidBody3DWorldCenter,
} from './world';

describe('addPhysics3DBody', () => {
  it('rejects static-surface geometry on a movable body', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    body.colliders.push(createPhysics3DCollider(createCollisionTriangleMesh3D([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2])));

    expect(() => addPhysics3DBody(world, body)).toThrow(/static rigid body/);
    expect(world.bodies).toHaveLength(0);
  });

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
    const removedIndex = first.index;
    removePhysics3DBody(world, first);

    const second = createRigidBody3D();
    const index = addPhysics3DBody(world, second);

    expect(index).not.toBe(removedIndex);
    expect(first.index).toBe(-1);
    expect(findPhysics3DBody(world, removedIndex)).toBeNull();
  });

  it('permits a removed body to enter another world under a fresh index', () => {
    const firstWorld = createPhysics3DWorld();
    const secondWorld = createPhysics3DWorld();
    const body = createRigidBody3D();
    addPhysics3DBody(firstWorld, body);
    removePhysics3DBody(firstWorld, body);

    expect(() => addPhysics3DBody(secondWorld, body)).not.toThrow();
    expect(secondWorld.bodies).toEqual([body]);
  });

  it('rejects duplicate and cross-world insertion without corrupting either world', () => {
    const world = createPhysics3DWorld();
    const otherWorld = createPhysics3DWorld();
    const body = createRigidBody3D();
    const index = addPhysics3DBody(world, body);

    expect(() => addPhysics3DBody(world, body)).toThrow();
    expect(() => addPhysics3DBody(otherWorld, body)).toThrow();
    expect(world.bodies).toEqual([body]);
    expect(world.bodyByIndex.get(index)).toBe(body);
    expect(otherWorld.bodies).toHaveLength(0);
  });

  it('derives mass and claims colliders authored before insertion', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D();
    const collider = createPhysics3DCollider(colliderUnitBox());
    body.colliders.push(collider);

    addPhysics3DBody(world, body);

    expect(body.mass).toBeCloseTo(1, 12);
    expect(body.inverseMass).toBeCloseTo(1, 12);

    const second = createRigidBody3D();
    second.colliders.push(collider);
    expect(() => addPhysics3DBody(world, second)).toThrow(/share/);
    expect(second.index).toBe(-1);
  });

  it('rejects the same pre-authored collider twice before mutating the world', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D();
    const collider = createPhysics3DCollider(colliderUnitBox());
    body.colliders.push(collider, collider);

    expect(() => addPhysics3DBody(world, body)).toThrow(/same collider twice/);
    expect(body.index).toBe(-1);
    expect(world.bodies).toHaveLength(0);
  });
});

describe('addPhysics3DCollider', () => {
  it('rejects a heightfield on an already-owned movable body', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);

    expect(() =>
      addPhysics3DCollider(world, body, createPhysics3DCollider(createCollisionHeightfield3D(2, 2, [0, 0, 0, 0]))),
    ).toThrow(/static rigid body/);
  });

  it('attaches the collider and derives the body mass from its geometry', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);
    expect(body.mass).toBe(0);

    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider(colliderUnitBox()));

    expect(body.colliders).toEqual([collider]);
    // A unit box of density 1 has volume 1.
    expect(body.mass).toBeCloseTo(1, 12);
    expect(body.inverseMass).toBeCloseTo(1, 12);
  });

  it('returns the collider it was given', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);
    const collider = createPhysics3DCollider(colliderUnitBox());
    expect(addPhysics3DCollider(world, body, collider)).toBe(collider);
  });

  it('moves the centre of mass to an offset collider', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);

    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: 1.5, minY: -0.5, minZ: -0.5, maxX: 2.5, maxY: 0.5, maxZ: 0.5 }),
    );

    expect(body.centerX).toBeCloseTo(2, 12);
  });

  it('balances a compound body between its pieces', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);

    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: -2.5, minY: -0.5, minZ: -0.5, maxX: -1.5, maxY: 0.5, maxZ: 0.5 }),
    );
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: 1.5, minY: -0.5, minZ: -0.5, maxX: 2.5, maxY: 0.5, maxZ: 0.5 }),
    );

    expect(body.mass).toBeCloseTo(2, 12);
    expect(body.centerX).toBeCloseTo(0, 12);
  });

  it('publishes the new geometry immediately rather than waiting for a step', () => {
    const world = createPhysics3DWorld();
    const floor = addColliderTestBody(world, -1);
    addPhysics3DCollider(world, floor, createPhysics3DCollider(colliderUnitBox()));
    const box = addColliderTestBody(world, -0.25);
    addPhysics3DCollider(world, box, createPhysics3DCollider(colliderUnitBox()));

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(1);
  });

  it('refuses the same collider twice on one body', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);
    const collider = createPhysics3DCollider(colliderUnitBox());
    addPhysics3DCollider(world, body, collider);

    expect(() => addPhysics3DCollider(world, body, collider)).toThrow(/twice/);
  });

  it('refuses to share one collider between two bodies', () => {
    // A collider holds the world shape its body's pose is written into, so sharing would have each step
    // overwrite the other body's transform.
    const world = createPhysics3DWorld();
    const collider = createPhysics3DCollider(colliderUnitBox());
    addPhysics3DCollider(world, addColliderTestBody(world), collider);

    expect(() => addPhysics3DCollider(world, addColliderTestBody(world), collider)).toThrow(/share/);
  });

  it('refuses to mutate a body through a world that does not own it', () => {
    const owner = createPhysics3DWorld();
    const foreign = createPhysics3DWorld();
    const body = addColliderTestBody(owner);

    expect(() => addPhysics3DCollider(foreign, body, createPhysics3DCollider(colliderUnitBox()))).toThrow(/own/);
    expect(body.colliders).toHaveLength(0);
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
    expect(applyPhysics3DForce(body, 1, 2, 3)).toBe(false);
    expect(body.forceY).toBe(0);
  });

  it('rejects a non-finite force without partially mutating or waking the body', () => {
    const body = sphere();
    body.sleeping = true;

    expect(applyPhysics3DForce(body, 1, Number.NaN, 3)).toBe(false);

    expect(body.forceX).toBe(0);
    expect(body.forceY).toBe(0);
    expect(body.sleeping).toBe(true);
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

  it('rejects a non-finite point before accumulating any force', () => {
    const body = sphere();

    expect(applyPhysics3DForceAtPoint(body, 1, 2, 3, Number.POSITIVE_INFINITY, 0, 0)).toBe(false);

    expect(body.forceX).toBe(0);
    expect(body.torqueZ).toBe(0);
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
    expect(applyPhysics3DLinearImpulse(body, 100, 0, 0)).toBe(false);
    expect(body.velocityX).toBe(0);
  });

  it('rejects a non-finite impulse without poisoning velocity', () => {
    const body = sphere();

    expect(applyPhysics3DLinearImpulse(body, Number.NaN, 0, 0)).toBe(false);

    expect(body.velocityX).toBe(0);
  });
});

describe('applyPhysics3DLinearImpulseAtPoint', () => {
  it('changes linear and angular velocity through the world inverse inertia', () => {
    const body = sphere();

    expect(applyPhysics3DLinearImpulseAtPoint(body, 1, 0, 0, 0, 1, 0)).toBe(true);

    expect(body.velocityX).toBeGreaterThan(0);
    expect(body.angularVelocityZ).toBeLessThan(0);
  });

  it('uses the world centre of mass for the lever arm', () => {
    const body = sphere();
    body.centerY = 1;

    applyPhysics3DLinearImpulseAtPoint(body, 1, 0, 0, 0, 1, 0);

    expect(body.angularVelocityZ).toBeCloseTo(0, 12);
  });

  it('rejects invalid input atomically', () => {
    const body = sphere();

    expect(applyPhysics3DLinearImpulseAtPoint(body, 1, 0, 0, 0, Number.NaN, 0)).toBe(false);

    expect(body.velocityX).toBe(0);
    expect(body.angularVelocityZ).toBe(0);
  });
});

describe('applyPhysics3DTorque', () => {
  it('accumulates onto the torque vector', () => {
    const body = sphere();
    applyPhysics3DTorque(body, 0, 0, 4);
    expect(body.torqueZ).toBe(4);
  });

  it('rejects non-finite torque and a body with fixed rotation', () => {
    const body = sphere();
    expect(applyPhysics3DTorque(body, 0, 0, Number.NaN)).toBe(false);
    setPhysics3DBodyFixedRotation(body, true);
    expect(applyPhysics3DTorque(body, 0, 0, 4)).toBe(false);
    expect(body.torqueZ).toBe(0);
  });
});

describe('createPhysics3DCollider', () => {
  it('defaults to a solid, mildly frictional, non-bouncing surface that collides with everything', () => {
    const collider = createPhysics3DCollider(colliderUnitBox());
    expect(collider.material).toEqual({ density: 1, friction: 0.2, restitution: 0 });
    expect(collider.filter).toEqual({ categoryBits: 1, maskBits: 0xffff, groupIndex: 0 });
    expect(collider.sensor).toBe(false);
  });

  it('takes the material, filter, and sensor flag a caller supplies', () => {
    const collider = createPhysics3DCollider(
      colliderUnitBox(),
      { density: 7, friction: 0.9, restitution: 0.5 },
      { categoryBits: 4, maskBits: 8, groupIndex: -1 },
      true,
    );
    expect(collider.material.density).toBe(7);
    expect(collider.filter.groupIndex).toBe(-1);
    expect(collider.sensor).toBe(true);
  });

  it('clones the authored shape, so a caller reusing one object does not link two colliders', () => {
    const local = colliderUnitBox();
    const first = createPhysics3DCollider(local);
    const second = createPhysics3DCollider(local);

    expect(first.local).not.toBe(local);
    expect(first.local).not.toBe(second.local);
  });

  it('clones hull points rather than aliasing the array', () => {
    const local: CollisionBuiltInShape3D = { kind: 'convex', points: [0, 0, 0, 1, 1, 1] };
    const collider = createPhysics3DCollider(local);
    expect(collider.local.kind === 'convex' && collider.local.points).not.toBe(local.points);
  });

  it('allocates the world shape ready to be written in place', () => {
    const collider = createPhysics3DCollider(colliderUnitBox());
    // An aabb promotes: rotate one and it is no longer axis-aligned.
    expect(collider.world.kind).toBe('box');
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

describe('hydratePhysics3DWorld', () => {
  it('upgrades the pre-collider world shape and clears unserializable solver caches', () => {
    const world = createPhysics3DWorld();
    const first = createRigidBody3D();
    const second = createRigidBody3D();
    addPhysics3DBody(world, first);
    addPhysics3DBody(world, second);
    world.contacts.push(contact(first.index, second.index));
    const legacyWorld = world as unknown as {
      version?: number;
      index?: Physics3DWorld['index'];
      jointEvents?: Physics3DWorld['jointEvents'];
      solver: {
        constraintByContact?: Physics3DWorld['solver']['constraintByContact'];
        constraintByPair?: Map<number, unknown>;
      };
    };
    const legacyBody = first as unknown as { colliders?: RigidBody3D['colliders'] };
    const legacyContact = world.contacts[0] as unknown as { colliderA?: number; colliderB?: number };
    legacyWorld.version = 1;
    delete legacyWorld.index;
    delete legacyWorld.jointEvents;
    delete legacyWorld.solver.constraintByContact;
    legacyWorld.solver.constraintByPair = new Map([[1, {}]]);
    delete legacyBody.colliders;
    delete legacyContact.colliderA;
    delete legacyContact.colliderB;
    delete (world.config as { maxCcdRotationSubsteps?: number }).maxCcdRotationSubsteps;

    expect(hydratePhysics3DWorld(world)).toBe(true);

    expect(world.version).toBe(Physics3DWorldVersion);
    expect(world.index).toBeDefined();
    expect(first.colliders).toEqual([]);
    expect(world.contacts[0].colliderA).toBe(0);
    expect(world.contacts[0].colliderB).toBe(0);
    expect(world.jointEvents).toEqual({ broke: [] });
    expect(world.solver.constraintByContact).toBeInstanceOf(Map);
    expect(world.solver.constraintByContact.size).toBe(0);
    expect(world.config.maxCcdRotationSubsteps).toBe(64);
    expect(legacyWorld.solver.constraintByPair).toBeUndefined();
  });

  it('preserves current values and rejects an unknown future version', () => {
    const current = createPhysics3DWorld();
    current.config.maxCcdSubsteps = 19;
    expect(hydratePhysics3DWorld(current)).toBe(true);
    expect(current.config.maxCcdSubsteps).toBe(19);

    const future = createPhysics3DWorld();
    future.version = Physics3DWorldVersion + 1;
    expect(hydratePhysics3DWorld(future)).toBe(false);
    expect(future.version).toBe(Physics3DWorldVersion + 1);
  });
});

describe('invalidatePhysics3DCollider', () => {
  it('rebuilds the mass properties after the local shape is edited in place', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);
    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider(colliderUnitBox()));
    expect(body.mass).toBeCloseTo(1, 12);

    const local = collider.local;
    if (local.kind === 'aabb') {
      local.maxX = 1.5;
      local.minX = -1.5;
    }
    expect(invalidatePhysics3DCollider(world, body, collider)).toBe(true);

    // Three times as wide, so three times the volume.
    expect(body.mass).toBeCloseTo(3, 12);
  });

  it('resizes the world shape when the edit changed the hull point count', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);
    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider({ kind: 'convex', points: [0, 0, 0] }));

    const local = collider.local;
    if (local.kind === 'convex') local.points.push(1, 1, 1);
    invalidatePhysics3DCollider(world, body, collider);

    expect(collider.world.kind === 'convex' && collider.world.points).toHaveLength(6);
  });

  it('returns false for a collider the body does not own', () => {
    const world = createPhysics3DWorld();
    expect(
      invalidatePhysics3DCollider(world, addColliderTestBody(world), createPhysics3DCollider(colliderUnitBox())),
    ).toBe(false);
  });

  it('drops the body contacts, whose lever arms were measured from the old centre of mass', () => {
    const world = createPhysics3DWorld();
    const floor = addColliderTestBody(world, -1);
    addPhysics3DCollider(world, floor, createPhysics3DCollider(colliderUnitBox()));
    const box = addColliderTestBody(world, -0.25);
    const collider = addPhysics3DCollider(world, box, createPhysics3DCollider(colliderUnitBox()));
    buildPhysics3DContacts(world);
    expect(world.contacts).toHaveLength(1);

    invalidatePhysics3DCollider(world, box, collider);

    expect(world.contacts).toHaveLength(0);
  });
});

describe('removePhysics3DBody', () => {
  it('wakes a sleeping neighbour whose support was removed', () => {
    const world = createPhysics3DWorld();
    const support = createRigidBody3D('static');
    const sleeper = createRigidBody3D('dynamic');
    addPhysics3DBody(world, support);
    addPhysics3DBody(world, sleeper);
    world.contacts.push(contact(support.index, sleeper.index));
    sleeper.sleeping = true;
    sleeper.sleepTimer = 1;

    removePhysics3DBody(world, support);

    expect(sleeper.sleeping).toBe(false);
    expect(sleeper.sleepTimer).toBe(0);
  });

  it('drops pending contact events that name the removed body', () => {
    const world = createPhysics3DWorld();
    const removed = createRigidBody3D();
    const survivor = createRigidBody3D();
    addPhysics3DBody(world, removed);
    addPhysics3DBody(world, survivor);
    const began = contact(removed.index, survivor.index);
    const ended = contact(removed.index, survivor.index);
    world.events.began.push(began);
    world.events.ended.push(ended);

    removePhysics3DBody(world, removed);

    expect(world.events.began).toHaveLength(0);
    expect(world.events.ended).toHaveLength(0);
  });

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
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: a.index, bodyB: b.index });
    joint.kind = 'Physics3DBallJoint';
    world.joints.push(joint);

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

describe('removePhysics3DCollider', () => {
  it('detaches the collider and rederives the mass', () => {
    const world = createPhysics3DWorld();
    const body = addColliderTestBody(world);
    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider(colliderUnitBox()));

    expect(removePhysics3DCollider(world, body, collider)).toBe(true);

    expect(body.colliders).toEqual([]);
    expect(body.mass).toBe(0);
    expect(body.inverseMass).toBe(0);
  });

  it('returns false for a collider the body does not own', () => {
    const world = createPhysics3DWorld();
    expect(removePhysics3DCollider(world, addColliderTestBody(world), createPhysics3DCollider(colliderUnitBox()))).toBe(
      false,
    );
  });

  it('drops the body contacts, because the surviving colliders have been renumbered', () => {
    // A contact stores collider INDICES. Keeping one across a removal would silently point it at whichever
    // piece of geometry shifted into that slot.
    const world = createPhysics3DWorld();
    const floor = addColliderTestBody(world, -1);
    addPhysics3DCollider(world, floor, createPhysics3DCollider(colliderUnitBox()));
    const box = addColliderTestBody(world, -0.25);
    const first = addPhysics3DCollider(world, box, createPhysics3DCollider(colliderUnitBox()));
    addPhysics3DCollider(
      world,
      box,
      createPhysics3DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 }),
    );
    buildPhysics3DContacts(world);
    expect(world.contacts.length).toBeGreaterThan(0);

    removePhysics3DCollider(world, box, first);

    expect(world.contacts).toHaveLength(0);
  });

  it('lets the same collider be attached to another body once detached', () => {
    const world = createPhysics3DWorld();
    const first = addColliderTestBody(world);
    const collider = addPhysics3DCollider(world, first, createPhysics3DCollider(colliderUnitBox()));
    removePhysics3DCollider(world, first, collider);

    expect(() => addPhysics3DCollider(world, addColliderTestBody(world), collider)).not.toThrow();
  });
});

describe('setPhysics3DBodyBullet', () => {
  it('changes continuous-collision policy and wakes an owned body', () => {
    const world = createPhysics3DWorld();
    const body = sphere();
    addPhysics3DBody(world, body);
    body.sleeping = true;

    setPhysics3DBodyBullet(body, true);

    expect(body.bullet).toBe(true);
    expect(body.sleeping).toBe(false);
  });

  it('rejects a non-boolean runtime value', () => {
    const body = sphere();

    expect(setPhysics3DBodyBullet(body, 1 as never)).toBe(false);
    expect(body.bullet).toBe(false);
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

  it('invalidates owned-body constraints whose effective mass just changed', () => {
    const world = createPhysics3DWorld();
    const body = sphere();
    const neighbour = sphere();
    addPhysics3DBody(world, body);
    addPhysics3DBody(world, neighbour);
    world.contacts.push(contact(body.index, neighbour.index));
    neighbour.sleeping = true;

    setPhysics3DBodyFixedRotation(body, true);

    expect(world.contacts).toHaveLength(0);
    expect(neighbour.sleeping).toBe(false);
  });
});

describe('setPhysics3DBodySleepEnabled', () => {
  it('wakes the body on either policy transition', () => {
    const body = sphere();
    body.sleeping = true;
    body.sleepTimer = 2;

    setPhysics3DBodySleepEnabled(body, false);

    expect(body.sleepEnabled).toBe(false);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
  });

  it('rejects a non-boolean runtime value', () => {
    const body = sphere();

    expect(setPhysics3DBodySleepEnabled(body, 'no' as never)).toBe(false);
    expect(body.sleepEnabled).toBe(true);
  });
});

function contact(bodyA: number, bodyB: number): Physics3DWorld['contacts'][number] {
  const value = createPhysics3DContact(bodyA, bodyB);
  value.normalY = 1;
  value.friction = 0.2;
  value.touching = true;
  return value;
}

function sphere(): RigidBody3D {
  const body = createRigidBody3D();
  const data = createPhysics3DMassData();
  computePhysics3DSphereMassData(1, 1, data);
  setRigidBody3DMassData(body, data);
  return body;
}

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

function colliderUnitBox(): CollisionBuiltInShape3D {
  return { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
}

function addColliderTestBody(world: Physics3DWorld, y = 0): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  body.y = y;
  addPhysics3DBody(world, body);
  return body;
}

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

  it('rejects a non-finite transform without invalidating the current world state', () => {
    const world = createPhysics3DWorld();
    const body = sphere();
    const neighbour = sphere();
    addPhysics3DBody(world, body);
    addPhysics3DBody(world, neighbour);
    world.contacts.push(contact(body.index, neighbour.index));

    expect(setPhysics3DBodyTransform(body, Number.NaN, 2, 3, 0, 0, 0, 1)).toBe(false);

    expect(body.x).toBe(0);
    expect(body.y).toBe(0);
    expect(world.contacts).toHaveLength(1);
  });

  it('wakes the body', () => {
    const body = sphere();
    body.sleeping = true;

    setPhysics3DBodyTransform(body, 1, 0, 0, 0, 0, 0, 1);

    expect(body.sleeping).toBe(false);
  });

  it('invalidates contacts and joint caches and wakes the other endpoints', () => {
    const world = createPhysics3DWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const body = sphere();
    const neighbour = sphere();
    addPhysics3DBody(world, body);
    addPhysics3DBody(world, neighbour);
    world.contacts.push(contact(body.index, neighbour.index));
    const joint = addPhysics3DJoint(
      world,
      createPhysics3DBallAndSocketJoint({ bodyA: body.index, bodyB: neighbour.index }),
    );
    joint.impulse0 = 9;
    neighbour.sleeping = true;

    setPhysics3DBodyTransform(body, 10, 0, 0, 0, 0, 0, 1);

    expect(world.contacts).toHaveLength(0);
    expect(joint.impulse0).toBe(0);
    expect(neighbour.sleeping).toBe(false);
  });
});

describe('setPhysics3DBodyType', () => {
  it('declines to make a static terrain body movable', () => {
    const body = createRigidBody3D('static');
    body.colliders.push(createPhysics3DCollider(createCollisionTriangleMesh3D([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2])));

    expect(setPhysics3DBodyType(body, 'dynamic')).toBe(false);
    expect(body.type).toBe('static');
  });

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

  it('rejects an unknown runtime body type', () => {
    const body = sphere();

    expect(setPhysics3DBodyType(body, 'ghost' as never)).toBe(false);
    expect(body.type).toBe('dynamic');
  });

  it('invalidates owned-body contacts whose mass participation just changed', () => {
    const world = createPhysics3DWorld();
    const body = sphere();
    const neighbour = sphere();
    addPhysics3DBody(world, body);
    addPhysics3DBody(world, neighbour);
    world.contacts.push(contact(body.index, neighbour.index));
    neighbour.sleeping = true;

    setPhysics3DBodyType(body, 'static');

    expect(world.contacts).toHaveLength(0);
    expect(neighbour.sleeping).toBe(false);
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
