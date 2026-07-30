import type { Physics2DJoint } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  addPhysics2DJoint,
  getPhysics2DJointSolver,
  registerPhysics2DJointSolver,
  removePhysics2DJoint,
} from './jointRegistry';
import { stepPhysics2D } from './step';
import {
  addPhysics2DBody,
  createPhysics2DCollider,
  createPhysics2DWorld,
  createRigidBody2D,
  removePhysics2DBody,
} from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function body(world: ReturnType<typeof createPhysics2DWorld>, x: number, y: number) {
  const made = createRigidBody2D('dynamic', x, y);
  made.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
  return addPhysics2DBody(world, made);
}

function joint(kind: string, bodyA: number, bodyB: number, anchorAX = 0, anchorBX = 0): Physics2DJoint {
  return {
    kind,
    bodyA,
    bodyB,
    localAnchorAX: anchorAX,
    localAnchorAY: 0,
    localAnchorBX: anchorBX,
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

describe('addPhysics2DJoint', () => {
  it('orders the joint by body index, carrying its anchors with the swap', () => {
    // Obligation 1 applies to joints too: they enter the SAME sequential solve list as contacts, and a
    // joint has no broadphase to canonicalise it, so this is the one place it can be enforced. The
    // anchors have to travel with the bodies — a joint whose ends were exchanged without its anchors
    // would attach to the wrong points and hold the pair in a pose nobody asked for.
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Test', second.index, first.index, 7, 9));

    expect(added.bodyA).toBe(first.index);
    expect(added.bodyB).toBe(second.index);
    expect(added.localAnchorAX).toBe(9);
    expect(added.localAnchorBX).toBe(7);
  });

  it('leaves an already-ordered joint untouched', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Test', first.index, second.index, 7, 9));
    expect(added.bodyA).toBe(first.index);
    expect(added.localAnchorAX).toBe(7);
  });
});

describe('getPhysics2DJointSolver', () => {
  it('returns null for an unregistered kind rather than throwing', () => {
    // A scene deserialized with a joint kind this build does not know about should import and simply not
    // constrain, not refuse to load.
    const world = createPhysics2DWorld();
    expect(getPhysics2DJointSolver(world, 'acme.Conveyor')).toBeNull();
  });

  it('steps a world holding a joint whose kind has no solver', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    addPhysics2DJoint(world, joint('acme.Unknown', first.index, second.index));
    expect(() => stepPhysics2D(world, 1 / 60)).not.toThrow();
  });
});

describe('registerPhysics2DJointSolver', () => {
  it('makes a custom kind solvable without this package knowing it', () => {
    const world = createPhysics2DWorld(0, 0);
    let prepared = 0;
    let solved = 0;
    registerPhysics2DJointSolver(world, 'acme.Conveyor', {
      prepare: () => void prepared++,
      solve: () => void solved++,
    });
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    addPhysics2DJoint(world, joint('acme.Conveyor', first.index, second.index));
    stepPhysics2D(world, 1 / 60);

    expect(prepared).toBe(1);
    expect(solved).toBe(world.config.velocityIterations);
  });

  it('is scoped to its world, so two worlds can register different kinds', () => {
    const first = createPhysics2DWorld();
    const second = createPhysics2DWorld();
    registerPhysics2DJointSolver(first, 'acme.One', { prepare: () => {}, solve: () => {} });
    expect(getPhysics2DJointSolver(first, 'acme.One')).not.toBeNull();
    expect(getPhysics2DJointSolver(second, 'acme.One')).toBeNull();
  });

  it('lets a later registration replace an earlier one', () => {
    const world = createPhysics2DWorld();
    const replacement = { prepare: () => {}, solve: () => {} };
    registerPhysics2DJointSolver(world, 'acme.One', { prepare: () => {}, solve: () => {} });
    registerPhysics2DJointSolver(world, 'acme.One', replacement);
    expect(getPhysics2DJointSolver(world, 'acme.One')).toBe(replacement);
  });
});

describe('removePhysics2DJoint', () => {
  it('removes the joint and reports false for one the world does not hold', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Test', first.index, second.index));
    expect(removePhysics2DJoint(world, added)).toBe(true);
    expect(world.joints).toHaveLength(0);
    expect(removePhysics2DJoint(world, added)).toBe(false);
  });

  it('drops joints naming a removed body, so a later body cannot inherit the constraint', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    addPhysics2DJoint(world, joint('Test', first.index, second.index));
    removePhysics2DBody(world, second);
    expect(world.joints).toHaveLength(0);
  });
});
