import {
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { CollisionBuiltInShape3D, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildPhysics3DContacts, setPhysics3DContactIntakeGuard } from './contactIntake';
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

function box(halfX: number, halfY: number, halfZ: number): CollisionBuiltInShape3D {
  return { kind: 'aabb', minX: -halfX, minY: -halfY, minZ: -halfZ, maxX: halfX, maxY: halfY, maxZ: halfZ };
}

// A floor at y=0 spanning enough ground that nothing in these tests walks off it.
function addFloor(world: Physics3DWorld): RigidBody3D {
  const floor = createRigidBody3D('static');
  floor.y = -1;
  addPhysics3DBody(world, floor);
  addPhysics3DCollider(world, floor, createPhysics3DCollider(box(20, 1, 20)));
  return floor;
}

function addCrate(world: Physics3DWorld, x: number, y: number, sensor = false): RigidBody3D {
  const crate = createRigidBody3D('dynamic');
  crate.x = x;
  crate.y = y;
  addPhysics3DBody(world, crate);
  addPhysics3DCollider(world, crate, createPhysics3DCollider(box(0.5, 0.5, 0.5), undefined, undefined, sensor));
  return crate;
}

describe('buildPhysics3DContacts', () => {
  it('generates a contact for an overlapping pair with no caller-supplied contact', () => {
    // The whole point of the intake: the world was GIVEN no contacts and finds one itself.
    const world = createPhysics3DWorld();
    addFloor(world);
    const crate = addCrate(world, 0, 0.4);
    expect(world.contacts).toHaveLength(0);

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].pointCount).toBeGreaterThan(0);
    expect(crate.index).toBeGreaterThanOrEqual(0);
  });

  it('gives a resting box four points, so it does not topple off a single one', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    addCrate(world, 0, 0.45);

    buildPhysics3DContacts(world);

    expect(world.contacts[0].pointCount).toBe(4);
  });

  it('orients the normal to push A out of B', () => {
    const world = createPhysics3DWorld();
    const floor = addFloor(world);
    const crate = addCrate(world, 0, 0.45);

    buildPhysics3DContacts(world);

    // The floor was added first, so it holds the lower index and is body A. Resolving must push the
    // FLOOR out of the crate, which is downward.
    const contact = world.contacts[0];
    expect(contact.bodyA).toBe(floor.index);
    expect(contact.bodyB).toBe(crate.index);
    expect(contact.normalY).toBeCloseTo(-1, 5);
  });

  it('finds no contact for a pair that is clear of each other', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    addCrate(world, 0, 3);

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(0);
  });

  it('reports a begin the step a pair starts touching, and only that step', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    const crate = addCrate(world, 0, 3);

    buildPhysics3DContacts(world);
    expect(world.events.began).toHaveLength(0);

    crate.y = 0.45;
    buildPhysics3DContacts(world);
    expect(world.events.began).toHaveLength(1);

    buildPhysics3DContacts(world);
    expect(world.events.began).toHaveLength(0);
    expect(world.contacts).toHaveLength(1);
  });

  it('reports an end the step a pair stops touching, and retires the contact', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    const crate = addCrate(world, 0, 0.45);

    buildPhysics3DContacts(world);
    expect(world.contacts).toHaveLength(1);

    crate.y = 5;
    buildPhysics3DContacts(world);

    expect(world.events.ended).toHaveLength(1);
    expect(world.contacts).toHaveLength(0);
  });

  it('keeps one contact object across steps, so a warm-start cache has something to match', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    addCrate(world, 0, 0.45);

    buildPhysics3DContacts(world);
    const first = world.contacts[0];
    buildPhysics3DContacts(world);

    expect(world.contacts[0]).toBe(first);
  });

  it('reports a sensor overlap without making it resolvable', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    addCrate(world, 0, 0.45, true);

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].sensor).toBe(true);
  });

  it('skips a pair whose filters exclude each other', () => {
    const world = createPhysics3DWorld();
    const floor = createRigidBody3D('static');
    floor.y = -1;
    addPhysics3DBody(world, floor);
    addPhysics3DCollider(
      world,
      floor,
      createPhysics3DCollider(box(20, 1, 20), undefined, { categoryBits: 1, maskBits: 1, groupIndex: 0 }),
    );
    const crate = createRigidBody3D('dynamic');
    crate.y = 0.45;
    addPhysics3DBody(world, crate);
    addPhysics3DCollider(
      world,
      crate,
      createPhysics3DCollider(box(0.5, 0.5, 0.5), undefined, { categoryBits: 2, maskBits: 2, groupIndex: 0 }),
    );

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(0);
  });

  it('generates no contact between two static bodies, which nothing could resolve', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    const wall = createRigidBody3D('static');
    wall.y = 0.45;
    addPhysics3DBody(world, wall);
    addPhysics3DCollider(world, wall, createPhysics3DCollider(box(0.5, 0.5, 0.5)));

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(0);
  });

  it('gives a compound body one contact per touching collider pair', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    const barbell = createRigidBody3D('dynamic');
    barbell.y = 0.45;
    addPhysics3DBody(world, barbell);
    // Two feet, far enough apart that each touches the floor as its own contact.
    addPhysics3DCollider(
      world,
      barbell,
      createPhysics3DCollider({ kind: 'aabb', minX: -3.5, minY: -0.5, minZ: -0.5, maxX: -2.5, maxY: 0.5, maxZ: 0.5 }),
    );
    addPhysics3DCollider(
      world,
      barbell,
      createPhysics3DCollider({ kind: 'aabb', minX: 2.5, minY: -0.5, minZ: -0.5, maxX: 3.5, maxY: 0.5, maxZ: 0.5 }),
    );

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(2);
    expect(world.contacts.map((contact) => contact.colliderB)).toEqual([0, 1]);
  });

  it('sorts contacts into a deterministic order regardless of insertion history', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    addCrate(world, 5, 0.45);
    addCrate(world, -5, 0.45);
    addCrate(world, 0, 0.45);

    buildPhysics3DContacts(world);

    const pairs = world.contacts.map((contact) => `${contact.bodyA}:${contact.bodyB}`);
    expect(pairs).toEqual([...pairs].sort());
  });

  it('measures the lever arms from the centre of mass rather than the body origin', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    // One collider, offset a whole unit along +x from the body origin, so the centre of mass is there
    // and not at the origin.
    const crate = createRigidBody3D('dynamic');
    crate.y = 0.45;
    addPhysics3DBody(world, crate);
    addPhysics3DCollider(
      world,
      crate,
      createPhysics3DCollider({ kind: 'aabb', minX: 0.5, minY: -0.5, minZ: -0.5, maxX: 1.5, maxY: 0.5, maxZ: 0.5 }),
    );

    expect(crate.centerX).toBeCloseTo(1, 9);
    buildPhysics3DContacts(world);

    // Every contact point sits under the collider around x=1, so an arm measured from the origin would
    // average about +1 and one measured from the centre of mass about 0.
    const contact = world.contacts[0];
    let sum = 0;
    for (let i = 0; i < contact.pointCount; i += 1) sum += contact.points[i].rBX;
    expect(sum / contact.pointCount).toBeCloseTo(0, 6);
  });
});

describe('setPhysics3DContactIntakeGuard', () => {
  it('is consulted on every rebuild, and only while installed', () => {
    const seen: number[] = [];
    setPhysics3DContactIntakeGuard((world) => seen.push(world.bodies.length));
    try {
      const world = createPhysics3DWorld();
      addFloor(world);
      addCrate(world, 0, 3);

      buildPhysics3DContacts(world);
      expect(seen).toEqual([2]);

      // Unlike the step guard, this one fires on a HEALTHY rebuild too: the failure it reports — no
      // registered support, so nothing can ever touch — is invisible in the output of a successful call.
      buildPhysics3DContacts(world);
      expect(seen).toEqual([2, 2]);

      setPhysics3DContactIntakeGuard(null);
      buildPhysics3DContacts(world);
      expect(seen).toEqual([2, 2]);
    } finally {
      setPhysics3DContactIntakeGuard(null);
    }
  });
});

describe('stepPhysics3D contact generation', () => {
  it('lands a falling box on a floor and settles it there', () => {
    // The end-to-end claim the whole arc exists for: a world given NO contacts simulates a solid.
    const world = createPhysics3DWorld();
    addFloor(world);
    const crate = addCrate(world, 0, 3);

    for (let i = 0; i < 240; i += 1) stepPhysics3D(world, 1 / 60);

    // Resting on the floor means the crate's underside is at y=0, so its centre is at its half extent.
    expect(crate.y).toBeGreaterThan(0.4);
    expect(crate.y).toBeLessThan(0.6);
    expect(Math.abs(crate.velocityY)).toBeLessThan(0.1);
  });

  it('does not let a box fall through a floor it started above', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    const crate = addCrate(world, 0, 1.5);

    for (let i = 0; i < 600; i += 1) stepPhysics3D(world, 1 / 60);

    expect(crate.y).toBeGreaterThan(0);
  });

  it('stacks two boxes without either sinking into the other', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    const lower = addCrate(world, 0, 0.5);
    const upper = addCrate(world, 0, 1.5);

    for (let i = 0; i < 300; i += 1) stepPhysics3D(world, 1 / 60);

    expect(lower.y).toBeGreaterThan(0.4);
    // The upper box rests on the lower one, a full box height above it.
    expect(upper.y - lower.y).toBeGreaterThan(0.9);
    expect(upper.y - lower.y).toBeLessThan(1.1);
  });

  it('leaves world.events filled by the step rather than empty', () => {
    const world = createPhysics3DWorld();
    addFloor(world);
    addCrate(world, 0, 0.6);

    let began = 0;
    for (let i = 0; i < 60; i += 1) {
      stepPhysics3D(world, 1 / 60);
      began += world.events.began.length;
    }

    expect(began).toBe(1);
  });

  it('runs identically twice from the same initial state', () => {
    const trace = (): number[] => {
      const world = createPhysics3DWorld();
      addFloor(world);
      const crate = addCrate(world, 0.1, 2);
      const samples: number[] = [];
      for (let i = 0; i < 180; i += 1) {
        stepPhysics3D(world, 1 / 60);
        samples.push(crate.x, crate.y, crate.z);
      }
      return samples;
    };
    expect(trace()).toEqual(trace());
  });
});
