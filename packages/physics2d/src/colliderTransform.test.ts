import type { CollisionShape } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createPhysics2DColliderWorldShape,
  updatePhysics2DColliderWorldShape,
  writePhysics2DColliderBounds,
} from './colliderTransform';
import { createPhysics2DCollider, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function bounds() {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

describe('createPhysics2DColliderWorldShape', () => {
  it('promotes an axis-aligned box to an oriented box, since a rotated box is not axis-aligned', () => {
    expect(createPhysics2DColliderWorldShape({ kind: 'aabb', minX: 0, minY: 0, maxX: 1, maxY: 1 }).kind).toBe('obb');
  });

  it('keeps the kind for shapes a rigid transform preserves', () => {
    expect(createPhysics2DColliderWorldShape({ kind: 'circle', x: 0, y: 0, radius: 1 }).kind).toBe('circle');
    expect(createPhysics2DColliderWorldShape({ kind: 'polygon', points: [0, 0, 1, 0, 0, 1] }).kind).toBe('polygon');
  });

  it('gives a polygon its own points array so the per-step transform cannot write through to the local shape', () => {
    const local: CollisionShape = { kind: 'polygon', points: [0, 0, 1, 0, 0, 1] };
    const world = createPhysics2DColliderWorldShape(local);
    expect(world.kind === 'polygon' && world.points).not.toBe(local.points);
  });
});

describe('updatePhysics2DColliderWorldShape', () => {
  it('rotates and translates a circle offset from the body origin', () => {
    const collider = createPhysics2DCollider({ kind: 'circle', x: 1, y: 0, radius: 0.5 }, STONE);
    const body = createRigidBody2D('dynamic', 10, 5, Math.PI / 2);
    updatePhysics2DColliderWorldShape(collider, body);
    expect(collider.world.kind).toBe('circle');
    if (collider.world.kind !== 'circle') return;
    expect(collider.world.x).toBeCloseTo(10);
    expect(collider.world.y).toBeCloseTo(6);
    expect(collider.world.radius).toBe(0.5);
  });

  it('carries the body angle onto the promoted oriented box rather than growing its extents', () => {
    const collider = createPhysics2DCollider({ kind: 'aabb', minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 }, STONE);
    const body = createRigidBody2D('dynamic', 0, 0, 0.7);
    updatePhysics2DColliderWorldShape(collider, body);
    expect(collider.world.kind).toBe('obb');
    if (collider.world.kind !== 'obb') return;
    expect(collider.world.rotation).toBeCloseTo(0.7);
    expect(collider.world.halfW).toBeCloseTo(1);
    expect(collider.world.halfH).toBeCloseTo(0.5);
  });

  it('composes the body angle with an oriented box collider own rotation', () => {
    const collider = createPhysics2DCollider({ kind: 'obb', x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0.2 }, STONE);
    const body = createRigidBody2D('dynamic', 0, 0, 0.5);
    updatePhysics2DColliderWorldShape(collider, body);
    if (collider.world.kind !== 'obb') return;
    expect(collider.world.rotation).toBeCloseTo(0.7);
  });

  it('transforms every polygon vertex in place', () => {
    const collider = createPhysics2DCollider({ kind: 'polygon', points: [0, 0, 1, 0, 0, 1] }, STONE);
    const body = createRigidBody2D('dynamic', 3, 4, 0);
    updatePhysics2DColliderWorldShape(collider, body);
    if (collider.world.kind !== 'polygon') return;
    expect(Array.from(collider.world.points)).toEqual([3, 4, 4, 4, 3, 5]);
  });
});

describe('writePhysics2DColliderBounds', () => {
  it('bounds a circle by its radius', () => {
    const collider = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 2 }, STONE);
    updatePhysics2DColliderWorldShape(collider, createRigidBody2D('dynamic', 1, 1));
    const out = bounds();
    writePhysics2DColliderBounds(collider, out);
    expect(out).toEqual({ minX: -1, minY: -1, maxX: 3, maxY: 3 });
  });

  it('grows an oriented box bound as it turns, and returns to its extents at a quarter turn', () => {
    // The bound of a rotated box is larger than the box; at 45 degrees it is largest, and at 90 it is the
    // original extents with width and height exchanged. Pinned because a bound that did not grow would
    // let the broadphase miss a genuine overlap.
    const collider = createPhysics2DCollider({ kind: 'aabb', minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 }, STONE);
    const out = bounds();

    updatePhysics2DColliderWorldShape(collider, createRigidBody2D('dynamic', 0, 0, Math.PI / 4));
    writePhysics2DColliderBounds(collider, out);
    expect(out.maxX).toBeGreaterThan(1);

    updatePhysics2DColliderWorldShape(collider, createRigidBody2D('dynamic', 0, 0, Math.PI / 2));
    writePhysics2DColliderBounds(collider, out);
    expect(out.maxX).toBeCloseTo(0.5);
    expect(out.maxY).toBeCloseTo(1);
  });

  it('bounds a polygon by its extreme vertices', () => {
    const collider = createPhysics2DCollider({ kind: 'polygon', points: [0, 0, 4, 1, 2, 5] }, STONE);
    updatePhysics2DColliderWorldShape(collider, createRigidBody2D('dynamic', 0, 0));
    const out = bounds();
    writePhysics2DColliderBounds(collider, out);
    expect(out).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 5 });
  });

  it('gives an area-less shape empty bounds rather than infinities', () => {
    const collider = createPhysics2DCollider({ kind: 'point', x: 1, y: 1 }, STONE);
    const out = bounds();
    writePhysics2DColliderBounds(collider, out);
    expect(Number.isFinite(out.minX)).toBe(true);
    expect(Number.isFinite(out.maxY)).toBe(true);
  });
});
