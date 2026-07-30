import type {
  Physics2DDistanceJoint,
  Physics2DMouseJoint,
  Physics2DRopeJoint,
  Physics2DWeldJoint,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import {
  Physics2DDistanceJointKind,
  Physics2DMouseJointKind,
  Physics2DRevoluteJointKind,
  Physics2DRopeJointKind,
  Physics2DWeldJointKind,
  physics2DDistanceJointSolver,
  physics2DMouseJointSolver,
  physics2DRevoluteJointSolver,
  physics2DRopeJointSolver,
  physics2DWeldJointSolver,
} from './joints';
import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function box(world: ReturnType<typeof createPhysics2DWorld>, type: 'dynamic' | 'static', x: number, y: number) {
  const body = createRigidBody2D(type, x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
  return addPhysics2DBody(world, body);
}

function baseJoint(kind: string, bodyA: number, bodyB: number) {
  return {
    kind,
    bodyA,
    bodyB,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorBX: 0,
    localAnchorBY: 0,
    collideConnected: false,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
  };
}

function run(world: ReturnType<typeof createPhysics2DWorld>, steps: number): void {
  for (let i = 0; i < steps; i++) stepPhysics2D(world, 1 / 60);
}

describe('physics2DDistanceJointSolver', () => {
  it('holds a hanging body at the joint length instead of letting it fall', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const bob = box(world, 'dynamic', 0, 3);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 2,
      stiffness: 0,
      damping: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 240);

    const separation = Math.sqrt((bob.x - anchor.x) ** 2 + (bob.y - anchor.y) ** 2);
    expect(separation).toBeGreaterThan(1.9);
    expect(separation).toBeLessThan(2.1);
  });

  it('swings a displaced bob back under the anchor rather than holding it out sideways', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const bob = box(world, 'dynamic', 2, 5);
    bob.linearDamping = 1.5;
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 2,
      stiffness: 0,
      damping: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 600);
    expect(bob.y).toBeLessThan(4);
  });
});

describe('physics2DMouseJointSolver', () => {
  it('drags a body toward its target', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      stiffness: 5,
      damping: 0.7,
    };
    addPhysics2DJoint(world, joint);
    run(world, 120);
    expect(dragged.x).toBeGreaterThan(3);
  });

  it('respects its force bound rather than injecting unbounded energy', () => {
    // The reason a mouse joint is soft by construction: a rigid drag lets a user pull a body arbitrarily
    // fast simply by moving the cursor, and the rest of the world absorbs it.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 1000,
      targetY: 0,
      maxForce: 0.5,
      stiffness: 5,
      damping: 0.7,
    };
    addPhysics2DJoint(world, joint);
    run(world, 60);
    expect(Math.abs(dragged.velocityX)).toBeLessThan(60);
    expect(Number.isFinite(dragged.x)).toBe(true);
  });
});

describe('physics2DRevoluteJointSolver', () => {
  it('keeps the pinned anchors together while leaving rotation free', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const arm = box(world, 'dynamic', 1, 5);
    const joint = {
      ...baseJoint(Physics2DRevoluteJointKind, anchor.index, arm.index),
      localAnchorAX: 0,
      localAnchorAY: 0,
      localAnchorBX: -1,
      localAnchorBY: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 180);

    // The arm's anchor point must stay on the static body's anchor.
    const cos = Math.cos(arm.angle);
    const sin = Math.sin(arm.angle);
    const anchorX = arm.x + -1 * cos - 0 * sin;
    const anchorY = arm.y + -1 * sin + 0 * cos;
    expect(Math.abs(anchorX - anchor.x)).toBeLessThan(0.15);
    expect(Math.abs(anchorY - anchor.y)).toBeLessThan(0.15);
    // Rotation is free, so gravity must have swung it.
    expect(Math.abs(arm.angle)).toBeGreaterThan(0.05);
  });
});

describe('physics2DRopeJointSolver', () => {
  it('goes slack inside its length and catches the body at full extension', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DRopeJointKind, physics2DRopeJointSolver);
    const anchor = box(world, 'static', 0, 10);
    const bob = box(world, 'dynamic', 0, 9.5);
    const joint: Physics2DRopeJoint = {
      ...baseJoint(Physics2DRopeJointKind, anchor.index, bob.index),
      maxLength: 3,
    };
    addPhysics2DJoint(world, joint);

    run(world, 30);
    // Still inside the rope's length: it must not have pulled the body back up.
    expect(anchor.y - bob.y).toBeLessThan(3.05);
    run(world, 300);
    expect(anchor.y - bob.y).toBeLessThan(3.2);
    expect(anchor.y - bob.y).toBeGreaterThan(2.8);
  });
});

describe('physics2DWeldJointSolver', () => {
  it('locks the relative angle as well as the anchor point', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const post = box(world, 'static', 0, 5);
    const welded = box(world, 'dynamic', 1, 5);
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, post.index, welded.index),
      localAnchorBX: -1,
      localAnchorBY: 0,
      referenceAngle: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 180);

    // A revolute would have swung; a weld holds the angle.
    expect(Math.abs(welded.angle)).toBeLessThan(0.2);
    expect(Math.abs(welded.y - 5)).toBeLessThan(0.3);
  });
});
