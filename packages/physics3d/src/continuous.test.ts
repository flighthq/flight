import {
  createCollisionTriangleMesh3D,
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { CollisionBuiltInShape3D, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  hasActivePhysics3DBullet,
  integratePhysics3DContinuous,
  writePhysics3DRotationalCcdEnvelope,
} from './continuous';
import { stepPhysics3D } from './step';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
} from './world';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

// A wall thin enough that a fast body crosses it entirely within one step. This is the whole subject.
const THIN_WALL: CollisionBuiltInShape3D = {
  kind: 'aabb',
  minX: -0.05,
  minY: -5,
  minZ: -5,
  maxX: 0.05,
  maxY: 5,
  maxZ: 5,
};

function addWall(world: Physics3DWorld): RigidBody3D {
  const wall = createRigidBody3D('static');
  addPhysics3DBody(world, wall);
  addPhysics3DCollider(world, wall, createPhysics3DCollider(THIN_WALL));
  return wall;
}

function addBullet(world: Physics3DWorld, x: number, speed: number, bullet = true): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  body.x = x;
  body.velocityX = speed;
  body.gravityScale = 0;
  body.bullet = bullet;
  addPhysics3DBody(world, body);
  addPhysics3DCollider(world, body, createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 0.1 }));
  return body;
}

function continuousWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  world.gravityY = 0;
  world.config.continuousCollision = true;
  return world;
}

describe('hasActivePhysics3DBullet', () => {
  it('reports false for a world with no flagged body', () => {
    const world = continuousWorld();
    addWall(world);
    addBullet(world, -5, 100, false);
    expect(hasActivePhysics3DBullet(world)).toBe(false);
  });

  it('reports true once a dynamic body asks for it', () => {
    const world = continuousWorld();
    expect(hasActivePhysics3DBullet(world)).toBe(false);
    addBullet(world, -5, 100);
    expect(hasActivePhysics3DBullet(world)).toBe(true);
  });

  it('ignores a sleeping body, which is not going anywhere', () => {
    const world = continuousWorld();
    const body = addBullet(world, -5, 100);
    body.sleeping = true;
    expect(hasActivePhysics3DBullet(world)).toBe(false);
  });

  it('ignores a static body, which cannot be a bullet', () => {
    const world = continuousWorld();
    const wall = addWall(world);
    wall.bullet = true;
    expect(hasActivePhysics3DBullet(world)).toBe(false);
  });
});

describe('integratePhysics3DContinuous', () => {
  it('stops a bullet at an accelerated static triangle mesh', () => {
    const world = continuousWorld();
    const wall = createRigidBody3D('static');
    wall.colliders.push(
      createPhysics3DCollider(
        createCollisionTriangleMesh3D([0, -5, -5, 0, 5, -5, 0, 5, 5, 0, -5, 5], [0, 1, 2, 0, 2, 3]),
      ),
    );
    addPhysics3DBody(world, wall);
    const bullet = addBullet(world, -5, 600);

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeLessThan(0);
  });

  it('deflects a spinning bullet that would cross a peg between its start and end orientations', () => {
    const world = continuousWorld();
    world.config.maxCcdRotationSubsteps = 128;
    const peg = createRigidBody3D('static');
    addPhysics3DBody(world, peg);
    addPhysics3DCollider(world, peg, createPhysics3DCollider({ kind: 'sphere', x: 4, y: 0, z: 0, radius: 0.25 }));
    const blade = createRigidBody3D('dynamic');
    blade.orientationZ = -Math.sin(Math.PI / 8);
    blade.orientationW = Math.cos(Math.PI / 8);
    blade.angularVelocityZ = 120;
    blade.gravityScale = 0;
    blade.bullet = true;
    addPhysics3DBody(world, blade);
    addPhysics3DCollider(
      world,
      blade,
      createPhysics3DCollider({ kind: 'aabb', minX: -5, minY: -0.1, minZ: -0.1, maxX: 5, maxY: 0.1, maxZ: 0.1 }),
    );

    stepPhysics3D(world, 1 / 60);

    expect(Math.abs(blade.y)).toBeGreaterThan(0.1);
    expect(Math.abs(blade.angularVelocityZ)).toBeLessThan(100);
  });

  it('allows the same rotational crossing when the angular CCD budget is zero', () => {
    const world = continuousWorld();
    world.config.maxCcdRotationSubsteps = 0;
    const peg = createRigidBody3D('static');
    addPhysics3DBody(world, peg);
    addPhysics3DCollider(world, peg, createPhysics3DCollider({ kind: 'sphere', x: 4, y: 0, z: 0, radius: 0.25 }));
    const blade = createRigidBody3D('dynamic');
    blade.orientationZ = -Math.sin(Math.PI / 8);
    blade.orientationW = Math.cos(Math.PI / 8);
    blade.angularVelocityZ = 120;
    blade.gravityScale = 0;
    blade.bullet = true;
    addPhysics3DBody(world, blade);
    addPhysics3DCollider(
      world,
      blade,
      createPhysics3DCollider({ kind: 'aabb', minX: -5, minY: -0.1, minZ: -0.1, maxX: 5, maxY: 0.1, maxZ: 0.1 }),
    );

    stepPhysics3D(world, 1 / 60);

    expect(blade.y).toBe(0);
    expect(blade.angularVelocityZ).toBeCloseTo(120, 9);
    expect(blade.orientationZ).toBeGreaterThan(0.3);
  });

  it('keeps analytic linear CCD active when a fast bullet also has slight spin', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = createRigidBody3D('dynamic');
    bullet.x = -5;
    bullet.velocityX = 600;
    bullet.angularVelocityZ = 0.01;
    bullet.gravityScale = 0;
    bullet.bullet = true;
    addPhysics3DBody(world, bullet);
    addPhysics3DCollider(
      world,
      bullet,
      createPhysics3DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 }),
    );

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeLessThan(0);
  });

  it('STOPS A BULLET AT A WALL IT WOULD OTHERWISE PASS THROUGH', () => {
    // The claim the whole path exists for. At 600 units/second and a 1/60 step, the body moves 10 units
    // in one step and the wall is 0.1 thick: discretely it is on one side before and the other side after,
    // overlapping at neither end.
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeLessThan(0);
    expect(bullet.x).toBeGreaterThan(-1);
  });

  it('lets the same bullet through when continuous collision is off', () => {
    // The control. Without this the test above could pass for a reason unrelated to CCD — a body that
    // never moved would also satisfy it.
    const world = continuousWorld();
    world.config.continuousCollision = false;
    addWall(world);
    const bullet = addBullet(world, -5, 600);

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeGreaterThan(4);
  });

  it('lets the bullet through when the BODY has not asked, even with the world configured', () => {
    const world = continuousWorld();
    addWall(world);
    const ordinary = addBullet(world, -5, 600, false);

    stepPhysics3D(world, 1 / 60);

    expect(ordinary.x).toBeGreaterThan(4);
  });

  it('removes the approach velocity at the impact', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);

    stepPhysics3D(world, 1 / 60);

    expect(bullet.velocityX).toBeLessThan(1);
  });

  it('publishes a persistent contact and runs both hooks in the impact step', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);
    const phases: string[] = [];
    world.contactHooks.preSolve = (_world, contact) => {
      phases.push('pre');
      expect(contact.bodyA).toBeLessThan(contact.bodyB);
      expect(contact.pointCount).toBe(1);
      expect(contact.points[0].depth).toBe(0);
    };
    world.contactHooks.postSolve = (_world, contact) => {
      phases.push('post');
      expect(contact.touching).toBe(true);
    };

    stepPhysics3D(world, 1 / 60);

    expect(phases).toEqual(['pre', 'post']);
    expect(world.events.began).toHaveLength(1);
    expect(world.events.ended).toHaveLength(0);
    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0]).toBe(world.events.began[0]);
    expect(world.contacts[0].bodyA).not.toBe(bullet.index);
    expect(world.contacts[0].bodyB).toBe(bullet.index);
  });

  it('lets an impact pre-solve hook disable resolution without losing its contact event', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);
    world.contactHooks.preSolve = (_world, contact) => {
      contact.enabled = false;
    };

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeGreaterThan(4);
    expect(world.events.began).toHaveLength(1);
    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].enabled).toBe(false);
  });

  it('uses restitution selected by the impact pre-solve hook', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);
    world.contactHooks.preSolve = (_inner, contact) => {
      contact.restitution = 1;
    };

    stepPhysics3D(world, 1 / 60);

    expect(bullet.velocityX).toBeLessThan(-500);
  });

  it('retains the TOI contact and restores its overrides when a late pre-solve hook throws', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);
    const error = new Error('impact hook failed');
    world.contactHooks.preSolve = (_inner, contact) => {
      contact.friction = 99;
      throw error;
    };

    expect(() => stepPhysics3D(world, 1 / 60)).toThrow(error);
    expect(bullet.x).toBeGreaterThan(-5);
    expect(bullet.x).toBeLessThan(0);
    expect(world.contacts).toHaveLength(1);
    expect(world.events.began).toEqual([world.contacts[0]]);
    expect(world.contacts[0].friction).not.toBe(99);

    world.contactHooks.preSolve = null;
    expect(() => stepPhysics3D(world, 1 / 60)).not.toThrow();
  });

  it('applies Coulomb friction at TOI instead of preserving all tangential speed', () => {
    function run(friction: number): RigidBody3D {
      const world = continuousWorld();
      const material = { density: 1, friction, restitution: 0 };
      const wall = createRigidBody3D('static');
      addPhysics3DBody(world, wall);
      addPhysics3DCollider(world, wall, createPhysics3DCollider(THIN_WALL, material));
      const bullet = createRigidBody3D('dynamic');
      bullet.x = -5;
      bullet.velocityX = 600;
      bullet.velocityY = 60;
      bullet.gravityScale = 0;
      bullet.bullet = true;
      addPhysics3DBody(world, bullet);
      addPhysics3DCollider(
        world,
        bullet,
        createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 0.1 }, material),
      );
      stepPhysics3D(world, 1 / 60);
      return bullet;
    }

    const frictionless = run(0);
    const gripping = run(1);
    // GJK's first-touch normal may contain a small tangential component at its tolerance boundary, so
    // the zero-friction control is deliberately a behavioural bound rather than a bit-exact 60 m/s.
    expect(Math.abs(frictionless.velocityY)).toBeGreaterThan(59);
    expect(Math.abs(gripping.velocityY)).toBeLessThan(1);
    expect(Math.abs(gripping.velocityY)).toBeLessThan(Math.abs(frictionless.velocityY) * 0.02);
  });

  it('reports the end transition on the step after a restitutive impact separates', () => {
    const world = continuousWorld();
    const material = { density: 1, friction: 0, restitution: 1 };
    const wall = createRigidBody3D('static');
    addPhysics3DBody(world, wall);
    addPhysics3DCollider(world, wall, createPhysics3DCollider(THIN_WALL, material));
    const bullet = createRigidBody3D('dynamic');
    bullet.x = -5;
    bullet.velocityX = 600;
    bullet.gravityScale = 0;
    bullet.bullet = true;
    addPhysics3DBody(world, bullet);
    addPhysics3DCollider(
      world,
      bullet,
      createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 0.1 }, material),
    );

    stepPhysics3D(world, 1 / 60);
    const impact = world.events.began[0];
    stepPhysics3D(world, 1 / 60);

    expect(world.events.began).toHaveLength(0);
    expect(world.events.ended).toEqual([impact]);
    expect(world.contacts).toHaveLength(0);
  });

  it('bounces a restitutive bullet back off the wall', () => {
    const world = continuousWorld();
    const wall = createRigidBody3D('static');
    addPhysics3DBody(world, wall);
    addPhysics3DCollider(
      world,
      wall,
      createPhysics3DCollider(THIN_WALL, { density: 1, friction: 0.2, restitution: 0.8 }),
    );
    const bullet = createRigidBody3D('dynamic');
    bullet.x = -5;
    bullet.velocityX = 600;
    bullet.gravityScale = 0;
    bullet.bullet = true;
    addPhysics3DBody(world, bullet);
    addPhysics3DCollider(
      world,
      bullet,
      createPhysics3DCollider(
        { kind: 'sphere', x: 0, y: 0, z: 0, radius: 0.1 },
        { density: 1, friction: 0.2, restitution: 0.8 },
      ),
    );

    stepPhysics3D(world, 1 / 60);

    expect(bullet.velocityX).toBeLessThan(0);
  });

  it('keeps a bullet on the near side over many steps', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);

    for (let i = 0; i < 120; i += 1) stepPhysics3D(world, 1 / 60);

    // Never tunnels on a later step either: the contact solver takes over once the pair is touching.
    expect(bullet.x).toBeLessThan(0.2);
  });

  it('lets a bullet fly freely when nothing is in its way', () => {
    const world = continuousWorld();
    const bullet = addBullet(world, -5, 600);

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeCloseTo(5, 6);
  });

  it('does not stop a bullet passing a wall it misses', () => {
    // Offset far off the wall's face in Y, so the swept broadphase may still pair them but the sweep must
    // not report an impact.
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);
    bullet.y = 20;

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeCloseTo(5, 6);
  });

  it('flies straight through a SENSOR rather than stopping on it', () => {
    // A trigger volume reports overlaps and resolves nothing, so halting the world at one would stop a
    // bullet that should pass.
    const world = continuousWorld();
    const trigger = createRigidBody3D('static');
    addPhysics3DBody(world, trigger);
    addPhysics3DCollider(world, trigger, createPhysics3DCollider(THIN_WALL, undefined, undefined, true));
    const bullet = addBullet(world, -5, 600);
    let preSolveCount = 0;
    let postSolveCount = 0;
    world.contactHooks.preSolve = () => {
      preSolveCount += 1;
    };
    world.contactHooks.postSolve = () => {
      postSolveCount += 1;
    };

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeGreaterThan(4);
    expect(preSolveCount).toBe(0);
    expect(postSolveCount).toBe(0);
    expect(world.events.began).toHaveLength(1);
    expect(world.events.ended).toHaveLength(0);
    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0]).toBe(world.events.began[0]);
    expect(world.contacts[0].sensor).toBe(true);

    const crossing = world.contacts[0];
    stepPhysics3D(world, 1 / 60);

    expect(world.events.began).toHaveLength(0);
    expect(world.events.ended).toEqual([crossing]);
    expect(world.contacts).toHaveLength(0);
  });

  it('pairs a sensor begin and end inside one public step when a later substep proves the crossing', () => {
    const world = continuousWorld();
    world.config.substeps = 2;
    const trigger = createRigidBody3D('static');
    addPhysics3DBody(world, trigger);
    addPhysics3DCollider(world, trigger, createPhysics3DCollider(THIN_WALL, undefined, undefined, true));
    addBullet(world, -5, 1200);

    stepPhysics3D(world, 1 / 60);

    expect(world.events.began).toHaveLength(1);
    expect(world.events.ended).toHaveLength(1);
    expect(world.events.ended[0]).toBe(world.events.began[0]);
    expect(world.contacts).toHaveLength(0);
  });

  it('does not report a sensor behind a solid impact the bullet never reaches', () => {
    const world = continuousWorld();
    addWall(world);
    const trigger = createRigidBody3D('static');
    trigger.x = 3;
    addPhysics3DBody(world, trigger);
    addPhysics3DCollider(world, trigger, createPhysics3DCollider(THIN_WALL, undefined, undefined, true));
    const bullet = addBullet(world, -5, 600);

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeLessThan(0);
    expect(world.events.began.some((contact) => contact.sensor)).toBe(false);
    expect(world.contacts.every((contact) => !contact.sensor)).toBe(true);
  });

  it('ignores a wall the collision filter excludes', () => {
    const world = continuousWorld();
    const wall = createRigidBody3D('static');
    addPhysics3DBody(world, wall);
    addPhysics3DCollider(
      world,
      wall,
      createPhysics3DCollider(THIN_WALL, undefined, { categoryBits: 2, maskBits: 2, groupIndex: 0 }),
    );
    const bullet = createRigidBody3D('dynamic');
    bullet.x = -5;
    bullet.velocityX = 600;
    bullet.gravityScale = 0;
    bullet.bullet = true;
    addPhysics3DBody(world, bullet);
    addPhysics3DCollider(
      world,
      bullet,
      createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 0.1 }, undefined, {
        categoryBits: 1,
        maskBits: 1,
        groupIndex: 0,
      }),
    );

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeGreaterThan(4);
  });

  it('advances a non-bullet body normally alongside a bullet', () => {
    // The continuous path integrates EVERY awake body, not only the flagged one, so an ordinary body in
    // the same world must still move exactly as far as it would have.
    const world = continuousWorld();
    addWall(world);
    addBullet(world, -5, 600);
    const ordinary = createRigidBody3D('dynamic');
    ordinary.y = 30;
    ordinary.velocityY = 6;
    ordinary.gravityScale = 0;
    addPhysics3DBody(world, ordinary);
    addPhysics3DCollider(world, ordinary, createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 }));

    stepPhysics3D(world, 1 / 60);

    expect(ordinary.y).toBeCloseTo(30 + 6 / 60, 6);
  });

  it('leaves the broadphase at CURRENT bounds after running, not swept ones', () => {
    // The swept pass widens the index and must restore it. A query made after a step would otherwise
    // report a body as a candidate across the whole volume it travelled.
    const world = continuousWorld();
    addWall(world);
    addBullet(world, -5, 600);
    stepPhysics3D(world, 1 / 60);

    const ids: number[] = [];
    world.index.querySpatialPoint(-4.9, 0, 0, ids);
    expect(ids).toHaveLength(0);
  });

  it('GIVES A SQUARELY-STRUCK BODY NO SPIN', () => {
    // The invariant behind resolving the impact linearly. A box driven straight into a flat wall is a
    // symmetric collision and must come away with no rotation. The impact does carry a contact point, but
    // where two faces meet it names a CORNER of the shared region, and using that as a lever arm would
    // spin the box about it. If a future revision gives the impulse an angular term, this is what tells
    // it that a single witness is not enough and the case needs a manifold.
    const world = continuousWorld();
    addWall(world);
    const bullet = createRigidBody3D('dynamic');
    bullet.x = -5;
    bullet.velocityX = 600;
    bullet.gravityScale = 0;
    bullet.bullet = true;
    addPhysics3DBody(world, bullet);
    addPhysics3DCollider(
      world,
      bullet,
      createPhysics3DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 }),
    );

    stepPhysics3D(world, 1 / 60);

    expect(bullet.x).toBeLessThan(0);
    expect(Math.hypot(bullet.angularVelocityX, bullet.angularVelocityY, bullet.angularVelocityZ)).toBeCloseTo(0, 9);
  });

  it('runs directly without a step, for a caller assembling its own loop', () => {
    const world = continuousWorld();
    addWall(world);
    const bullet = addBullet(world, -5, 600);

    integratePhysics3DContinuous(world, 1 / 60);

    expect(bullet.x).toBeLessThan(0);
  });

  it('keeps the world mutation boundary around a direct custom-loop impact hook', () => {
    const world = continuousWorld();
    addWall(world);
    addBullet(world, -5, 600);
    world.contactHooks.preSolve = (inner) => addPhysics3DBody(inner, createRigidBody3D('dynamic'));

    expect(() => integratePhysics3DContinuous(world, 1 / 60)).toThrow(
      'Cannot mutate a physics world while it is stepping',
    );
    expect(world.bodies).toHaveLength(2);
  });

  it('rejects recursive continuous integration from an impact hook', () => {
    const world = continuousWorld();
    addWall(world);
    addBullet(world, -5, 600);
    world.contactHooks.preSolve = (inner) => integratePhysics3DContinuous(inner, 1 / 60);

    expect(() => integratePhysics3DContinuous(world, 1 / 60)).toThrow(
      'Cannot integrate a physics world recursively while it is stepping',
    );
  });
});

describe('writePhysics3DRotationalCcdEnvelope', () => {
  it('reports the one-degree target when the budget can cover the angular travel', () => {
    const out = {
      angularTravel: 0,
      sampleCount: 0,
      maxAngularIncrement: 0,
      maxPointArcTravel: 0,
      targetIncrementMet: false,
    };
    expect(writePhysics3DRotationalCcdEnvelope(120, 5, 1 / 60, 128, out)).toBe(true);
    expect(out.angularTravel).toBeCloseTo(2, 12);
    expect(out.sampleCount).toBe(115);
    expect(out.maxAngularIncrement).toBeLessThanOrEqual(Math.PI / 180);
    expect(out.maxPointArcTravel).toBeCloseTo((2 / 115) * 5, 12);
    expect(out.targetIncrementMet).toBe(true);
  });

  it('publishes the wider angular and spatial gap when the hard budget binds', () => {
    const out = {
      angularTravel: 0,
      sampleCount: 0,
      maxAngularIncrement: 0,
      maxPointArcTravel: 0,
      targetIncrementMet: true,
    };
    expect(writePhysics3DRotationalCcdEnvelope(120, 5, 1 / 60, 10, out)).toBe(true);
    expect(out.sampleCount).toBe(10);
    expect(out.maxAngularIncrement).toBeCloseTo(0.2, 12);
    expect(out.maxPointArcTravel).toBeCloseTo(1, 12);
    expect(out.targetIncrementMet).toBe(false);
  });

  it('makes a disabled rotational lane explicit and rejects invalid authoring inputs', () => {
    const out = {
      angularTravel: 0,
      sampleCount: 0,
      maxAngularIncrement: 0,
      maxPointArcTravel: 0,
      targetIncrementMet: true,
    };
    expect(writePhysics3DRotationalCcdEnvelope(10, 2, 1 / 60, 0, out)).toBe(true);
    expect(out.sampleCount).toBe(0);
    expect(out.maxAngularIncrement).toBe(Number.POSITIVE_INFINITY);
    expect(out.maxPointArcTravel).toBe(Number.POSITIVE_INFINITY);
    expect(out.targetIncrementMet).toBe(false);
    expect(writePhysics3DRotationalCcdEnvelope(-1, 2, 1 / 60, 10, out)).toBe(false);
    expect(out).toEqual({
      angularTravel: 0,
      sampleCount: 0,
      maxAngularIncrement: 0,
      maxPointArcTravel: 0,
      targetIncrementMet: false,
    });
    expect(writePhysics3DRotationalCcdEnvelope(Number.MAX_VALUE, 2, 2, 10, out)).toBe(false);
    expect(out).toEqual({
      angularTravel: 0,
      sampleCount: 0,
      maxAngularIncrement: 0,
      maxPointArcTravel: 0,
      targetIncrementMet: false,
    });
  });
});
