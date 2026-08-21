import {
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { CollisionBuiltInShape3D, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildPhysics3DContacts } from './contactIntake';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
  invalidatePhysics3DCollider,
  removePhysics3DCollider,
} from './world';

// The collider lifecycle: attaching geometry to a body, reshaping it, and taking it away. Kept apart from
// `world.test.ts`, which covers the body and world lifecycle those sit inside.

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

function unitBox(): CollisionBuiltInShape3D {
  return { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
}

function addBody(world: Physics3DWorld, y = 0): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  body.y = y;
  addPhysics3DBody(world, body);
  return body;
}

describe('addPhysics3DCollider', () => {
  it('attaches the collider and derives the body mass from its geometry', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world);
    expect(body.mass).toBe(0);

    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider(unitBox()));

    expect(body.colliders).toEqual([collider]);
    // A unit box of density 1 has volume 1.
    expect(body.mass).toBeCloseTo(1, 12);
    expect(body.inverseMass).toBeCloseTo(1, 12);
  });

  it('returns the collider it was given', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world);
    const collider = createPhysics3DCollider(unitBox());
    expect(addPhysics3DCollider(world, body, collider)).toBe(collider);
  });

  it('moves the centre of mass to an offset collider', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world);

    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: 1.5, minY: -0.5, minZ: -0.5, maxX: 2.5, maxY: 0.5, maxZ: 0.5 }),
    );

    expect(body.centerX).toBeCloseTo(2, 12);
  });

  it('balances a compound body between its pieces', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world);

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
    const floor = addBody(world, -1);
    addPhysics3DCollider(world, floor, createPhysics3DCollider(unitBox()));
    const box = addBody(world, -0.25);
    addPhysics3DCollider(world, box, createPhysics3DCollider(unitBox()));

    buildPhysics3DContacts(world);

    expect(world.contacts).toHaveLength(1);
  });

  it('refuses the same collider twice on one body', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world);
    const collider = createPhysics3DCollider(unitBox());
    addPhysics3DCollider(world, body, collider);

    expect(() => addPhysics3DCollider(world, body, collider)).toThrow(/twice/);
  });

  it('refuses to share one collider between two bodies', () => {
    // A collider holds the world shape its body's pose is written into, so sharing would have each step
    // overwrite the other body's transform.
    const world = createPhysics3DWorld();
    const collider = createPhysics3DCollider(unitBox());
    addPhysics3DCollider(world, addBody(world), collider);

    expect(() => addPhysics3DCollider(world, addBody(world), collider)).toThrow(/share/);
  });
});

describe('createPhysics3DCollider', () => {
  it('defaults to a solid, mildly frictional, non-bouncing surface that collides with everything', () => {
    const collider = createPhysics3DCollider(unitBox());
    expect(collider.material).toEqual({ density: 1, friction: 0.2, restitution: 0 });
    expect(collider.filter).toEqual({ categoryBits: 1, maskBits: 0xffff, groupIndex: 0 });
    expect(collider.sensor).toBe(false);
  });

  it('takes the material, filter, and sensor flag a caller supplies', () => {
    const collider = createPhysics3DCollider(
      unitBox(),
      { density: 7, friction: 0.9, restitution: 0.5 },
      { categoryBits: 4, maskBits: 8, groupIndex: -1 },
      true,
    );
    expect(collider.material.density).toBe(7);
    expect(collider.filter.groupIndex).toBe(-1);
    expect(collider.sensor).toBe(true);
  });

  it('clones the authored shape, so a caller reusing one object does not link two colliders', () => {
    const local = unitBox();
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
    const collider = createPhysics3DCollider(unitBox());
    // An aabb promotes: rotate one and it is no longer axis-aligned.
    expect(collider.world.kind).toBe('box');
  });
});

describe('invalidatePhysics3DCollider', () => {
  it('rebuilds the mass properties after the local shape is edited in place', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world);
    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider(unitBox()));
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
    const body = addBody(world);
    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider({ kind: 'convex', points: [0, 0, 0] }));

    const local = collider.local;
    if (local.kind === 'convex') local.points.push(1, 1, 1);
    invalidatePhysics3DCollider(world, body, collider);

    expect(collider.world.kind === 'convex' && collider.world.points).toHaveLength(6);
  });

  it('returns false for a collider the body does not own', () => {
    const world = createPhysics3DWorld();
    expect(invalidatePhysics3DCollider(world, addBody(world), createPhysics3DCollider(unitBox()))).toBe(false);
  });

  it('drops the body contacts, whose lever arms were measured from the old centre of mass', () => {
    const world = createPhysics3DWorld();
    const floor = addBody(world, -1);
    addPhysics3DCollider(world, floor, createPhysics3DCollider(unitBox()));
    const box = addBody(world, -0.25);
    const collider = addPhysics3DCollider(world, box, createPhysics3DCollider(unitBox()));
    buildPhysics3DContacts(world);
    expect(world.contacts).toHaveLength(1);

    invalidatePhysics3DCollider(world, box, collider);

    expect(world.contacts).toHaveLength(0);
  });
});

describe('removePhysics3DCollider', () => {
  it('detaches the collider and rederives the mass', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world);
    const collider = addPhysics3DCollider(world, body, createPhysics3DCollider(unitBox()));

    expect(removePhysics3DCollider(world, body, collider)).toBe(true);

    expect(body.colliders).toEqual([]);
    expect(body.mass).toBe(0);
    expect(body.inverseMass).toBe(0);
  });

  it('returns false for a collider the body does not own', () => {
    const world = createPhysics3DWorld();
    expect(removePhysics3DCollider(world, addBody(world), createPhysics3DCollider(unitBox()))).toBe(false);
  });

  it('drops the body contacts, because the surviving colliders have been renumbered', () => {
    // A contact stores collider INDICES. Keeping one across a removal would silently point it at whichever
    // piece of geometry shifted into that slot.
    const world = createPhysics3DWorld();
    const floor = addBody(world, -1);
    addPhysics3DCollider(world, floor, createPhysics3DCollider(unitBox()));
    const box = addBody(world, -0.25);
    const first = addPhysics3DCollider(world, box, createPhysics3DCollider(unitBox()));
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
    const first = addBody(world);
    const collider = addPhysics3DCollider(world, first, createPhysics3DCollider(unitBox()));
    removePhysics3DCollider(world, first, collider);

    expect(() => addPhysics3DCollider(world, addBody(world), collider)).not.toThrow();
  });
});
