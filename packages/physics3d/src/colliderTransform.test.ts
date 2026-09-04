import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { CollisionBuiltInShape3D, Physics3DCollider, RigidBody3D, SpatialAabb3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createPhysics3DColliderWorldShape,
  initializeCollisionBox3D,
  initializeCollisionCapsule3D,
  initializeCollisionCone3D,
  initializeCollisionConvex3D,
  initializeCollisionCylinder3D,
  initializeCollisionSphere3D,
  updatePhysics3DColliderWorldShape,
  writePhysics3DColliderBounds,
} from './colliderTransform';
import { createPhysics3DCollider, createRigidBody3D } from './world';

function bounds(): SpatialAabb3D {
  return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
}

// A body spun a quarter turn about +Y, which maps local +x onto world -z.
function spunBody(): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  body.orientationY = Math.sin(Math.PI / 4);
  body.orientationW = Math.cos(Math.PI / 4);
  return body;
}

function collider(local: CollisionBuiltInShape3D): Physics3DCollider {
  return createPhysics3DCollider(local);
}

describe('createPhysics3DColliderWorldShape', () => {
  it('keeps the kind for shapes a rigid transform cannot change', () => {
    const sphere = createPhysics3DColliderWorldShape({ kind: 'sphere', x: 1, y: 2, z: 3, radius: 4 });
    expect(EntityRuntimeKey in sphere).toBe(true);
    expect(sphere.kind).toBe('sphere');
    expect(
      createPhysics3DColliderWorldShape({ kind: 'capsule', x0: 0, y0: 0, z0: 0, x1: 0, y1: 1, z1: 0, radius: 1 }).kind,
    ).toBe('capsule');
    expect(createPhysics3DColliderWorldShape({ kind: 'convex', points: [0, 0, 0] }).kind).toBe('convex');
  });

  it('promotes an axis-aligned box to an ORIENTED box', () => {
    // Rotate an aabb and it is no longer axis-aligned. Keeping the kind would silently grow the box to its
    // bounding extent the first time the body turned.
    const world = createPhysics3DColliderWorldShape({
      kind: 'aabb',
      minX: -1,
      minY: -1,
      minZ: -1,
      maxX: 1,
      maxY: 1,
      maxZ: 1,
    });
    expect(world.kind).toBe('box');
  });

  it('sizes hull storage from the local shape so the transform can write in place', () => {
    const local: CollisionBuiltInShape3D = { kind: 'convex', points: [1, 2, 3, 4, 5, 6] };
    const world = createPhysics3DColliderWorldShape(local);
    expect(world.kind === 'convex' && world.points).toHaveLength(6);
  });

  it('does not alias the local hull points', () => {
    const local: CollisionBuiltInShape3D = { kind: 'convex', points: [1, 2, 3] };
    const world = createPhysics3DColliderWorldShape(local);
    expect(world.kind === 'convex' && world.points).not.toBe(local.points);
  });
});

describe('initializeCollisionBox3D', () => {
  it('is the construction initializer of createCollisionBox3D', () => {
    expect(typeof initializeCollisionBox3D).toBe('function');
  });
});

describe('initializeCollisionCapsule3D', () => {
  it('is the construction initializer of createCollisionCapsule3D', () => {
    expect(typeof initializeCollisionCapsule3D).toBe('function');
  });
});
describe('initializeCollisionCone3D', () => {
  it('is the construction initializer of createCollisionCone3D', () => {
    expect(typeof initializeCollisionCone3D).toBe('function');
  });
});

describe('initializeCollisionConvex3D', () => {
  it('is the construction initializer of createCollisionConvex3D', () => {
    expect(typeof initializeCollisionConvex3D).toBe('function');
  });
});

describe('initializeCollisionCylinder3D', () => {
  it('is the construction initializer of createCollisionCylinder3D', () => {
    expect(typeof initializeCollisionCylinder3D).toBe('function');
  });
});

describe('initializeCollisionSphere3D', () => {
  it('is the construction initializer of createCollisionSphere3D', () => {
    expect(typeof initializeCollisionSphere3D).toBe('function');
  });
});

describe('updatePhysics3DColliderWorldShape', () => {
  it('translates a sphere by the body position', () => {
    const body = createRigidBody3D('dynamic');
    body.x = 10;
    body.y = 20;
    body.z = 30;
    const held = collider({ kind: 'sphere', x: 1, y: 0, z: 0, radius: 2 });

    updatePhysics3DColliderWorldShape(held, body);

    expect(held.world).toMatchObject({ kind: 'sphere', x: 11, y: 20, z: 30, radius: 2 });
  });

  it('rotates a sphere offset about the body origin', () => {
    const held = collider({ kind: 'sphere', x: 1, y: 0, z: 0, radius: 1 });

    updatePhysics3DColliderWorldShape(held, spunBody());

    // A quarter turn about +Y takes local +x to world -z.
    expect(held.world.kind === 'sphere' && held.world.x).toBeCloseTo(0, 9);
    expect(held.world.kind === 'sphere' && held.world.z).toBeCloseTo(-1, 9);
  });

  it('carries the body orientation onto a promoted aabb', () => {
    const body = spunBody();
    const held = collider({ kind: 'aabb', minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 });

    updatePhysics3DColliderWorldShape(held, body);

    expect(held.world.kind === 'box' && held.world.halfX).toBeCloseTo(1, 9);
    expect(held.world.kind === 'box' && held.world.halfZ).toBeCloseTo(3, 9);
    expect(held.world.kind === 'box' && held.world.rotationY).toBeCloseTo(body.orientationY, 9);
  });

  it('composes body and local rotations rather than replacing one with the other', () => {
    // Both a quarter turn about +Y: composed they are a half turn, whose quaternion is (0,1,0,0).
    const held = collider({
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: Math.sin(Math.PI / 4),
      rotationZ: 0,
      rotationW: Math.cos(Math.PI / 4),
    });

    updatePhysics3DColliderWorldShape(held, spunBody());

    expect(held.world.kind === 'box' && held.world.rotationY).toBeCloseTo(1, 9);
    expect(held.world.kind === 'box' && held.world.rotationW).toBeCloseTo(0, 9);
  });

  it('moves both capsule endpoints', () => {
    const body = createRigidBody3D('dynamic');
    body.y = 5;
    const held = collider({ kind: 'capsule', x0: 0, y0: -1, z0: 0, x1: 0, y1: 1, z1: 0, radius: 0.5 });

    updatePhysics3DColliderWorldShape(held, body);

    expect(held.world.kind === 'capsule' && held.world.y0).toBeCloseTo(4, 9);
    expect(held.world.kind === 'capsule' && held.world.y1).toBeCloseTo(6, 9);
  });

  it('moves every hull point', () => {
    const body = createRigidBody3D('dynamic');
    body.x = 100;
    const held = collider({ kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0] });

    updatePhysics3DColliderWorldShape(held, body);

    expect(held.world.kind === 'convex' && held.world.points).toEqual([100, 0, 0, 101, 0, 0, 100, 1, 0]);
  });

  it('writes in place, so a step over many colliders allocates nothing', () => {
    const body = createRigidBody3D('dynamic');
    const held = collider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 });
    const before = held.world;

    body.x = 1;
    updatePhysics3DColliderWorldShape(held, body);
    body.x = 2;
    updatePhysics3DColliderWorldShape(held, body);

    expect(held.world).toBe(before);
  });
});

describe('writePhysics3DColliderBounds', () => {
  it('bounds a sphere by its radius', () => {
    const out = bounds();
    const held = collider({ kind: 'sphere', x: 1, y: 2, z: 3, radius: 4 });
    updatePhysics3DColliderWorldShape(held, createRigidBody3D('dynamic'));

    writePhysics3DColliderBounds(held, out);

    expect(out).toEqual({ minX: -3, minY: -2, minZ: -1, maxX: 5, maxY: 6, maxZ: 7 });
  });

  it('grows an oriented box to the extent its rotation sweeps', () => {
    const out = bounds();
    const held = collider({ kind: 'aabb', minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 });
    const body = createRigidBody3D('dynamic');
    // An eighth turn about +Y, where a unit box's x/z extent grows to sqrt(2).
    body.orientationY = Math.sin(Math.PI / 8);
    body.orientationW = Math.cos(Math.PI / 8);
    updatePhysics3DColliderWorldShape(held, body);

    writePhysics3DColliderBounds(held, out);

    expect(out.maxX).toBeCloseTo(Math.SQRT2, 9);
    expect(out.maxZ).toBeCloseTo(Math.SQRT2, 9);
    // The rotation axis is unaffected.
    expect(out.maxY).toBeCloseTo(1, 9);
  });

  it('leaves an unrotated box at its own extent rather than inflating it', () => {
    const out = bounds();
    const held = collider({ kind: 'aabb', minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 });
    updatePhysics3DColliderWorldShape(held, createRigidBody3D('dynamic'));

    writePhysics3DColliderBounds(held, out);

    expect(out).toEqual({ minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 });
  });

  it('bounds a capsule by both endpoints plus the radius', () => {
    const out = bounds();
    const held = collider({ kind: 'capsule', x0: -2, y0: 0, z0: 0, x1: 2, y1: 0, z1: 0, radius: 0.5 });
    updatePhysics3DColliderWorldShape(held, createRigidBody3D('dynamic'));

    writePhysics3DColliderBounds(held, out);

    expect(out).toEqual({ minX: -2.5, minY: -0.5, minZ: -0.5, maxX: 2.5, maxY: 0.5, maxZ: 0.5 });
  });

  it('bounds a hull by its extreme points', () => {
    const out = bounds();
    const held = collider({ kind: 'convex', points: [-1, 0, 0, 3, 0, 0, 0, 7, 0, 0, 0, -2] });
    updatePhysics3DColliderWorldShape(held, createRigidBody3D('dynamic'));

    writePhysics3DColliderBounds(held, out);

    expect(out).toEqual({ minX: -1, minY: 0, minZ: -2, maxX: 3, maxY: 7, maxZ: 0 });
  });

  it('zeroes the bounds of an empty hull rather than reporting infinities', () => {
    const out = bounds();
    const held = collider({ kind: 'convex', points: [] });

    writePhysics3DColliderBounds(held, out);

    expect(out).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
  });
});
