import { createEntity } from '@flighthq/entity/contract';
import type { Physics2DJoint } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  addPhysics2DJoint,
  getPhysics2DJointSolver,
  invalidatePhysics2DJoint,
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
  return createEntity({
    kind,
    bodyA,
    bodyB,
    localAnchorAX: anchorAX,
    localAnchorAY: 0,
    localAnchorBX: anchorBX,
    localAnchorBY: 0,
    collideConnected: false,
    breakForce: Number.POSITIVE_INFINITY,
    breakTorque: Number.POSITIVE_INFINITY,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
  });
}

describe('addPhysics2DJoint', () => {
  it('rejects duplicate and cross-world insertion without solving a shared accumulator twice', () => {
    const firstWorld = createPhysics2DWorld();
    const secondWorld = createPhysics2DWorld();
    const first = body(firstWorld, 0, 0);
    const second = body(firstWorld, 2, 0);
    const added = joint('Unknown', first.index, second.index);

    addPhysics2DJoint(firstWorld, added);

    expect(() => addPhysics2DJoint(firstWorld, added)).toThrow();
    expect(() => addPhysics2DJoint(secondWorld, added)).toThrow();
    expect(firstWorld.joints).toEqual([added]);
    expect(secondWorld.joints).toHaveLength(0);
  });

  it('wakes both bodies when an active constraint is added', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Test', { prepare: () => {}, solve: () => {} });
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    first.sleeping = true;
    first.sleepTimer = 5;
    second.sleeping = true;
    second.sleepTimer = 5;

    addPhysics2DJoint(world, joint('Test', first.index, second.index));

    expect(first.sleeping).toBe(false);
    expect(first.sleepTimer).toBe(0);
    expect(second.sleeping).toBe(false);
    expect(second.sleepTimer).toBe(0);
  });

  it('orders the joint by body index, carrying its anchors with the swap', () => {
    // Obligation 1 applies to joints too: they enter the SAME sequential solve list as contacts, and a
    // joint has no broadphase to canonicalise it, so this is the one place it can be enforced. The
    // anchors have to travel with the bodies — a joint whose ends were exchanged without its anchors
    // would attach to the wrong points and hold the pair in a pose nobody asked for.
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Test', { prepare: () => {}, solve: () => {} });
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Test', second.index, first.index, 7, 9));

    expect(added.bodyA).toBe(first.index);
    expect(added.bodyB).toBe(second.index);
    expect(added.localAnchorAX).toBe(9);
    expect(added.localAnchorBX).toBe(7);
  });

  // Adding a joint whose kind has no solver yet is explicitly supported — a scene can deserialize
  // ahead of the code that solves it. Canonicalizing there would exchange bodies and anchors while the
  // kind's own direction fields stayed as authored, and no later registration would repair that half
  // swap. So ordering waits for the kind, and an unsolved joint constrains nothing meanwhile.
  it('leaves a joint whose kind has no solver in its authored order', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);

    const added = addPhysics2DJoint(world, joint('Unknown', second.index, first.index, 7, 9));

    expect(added.bodyA).toBe(second.index);
    expect(added.localAnchorAX).toBe(7);
  });

  it('leaves an unknown joint inert until registration, then wakes both ends', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    first.sleeping = true;
    first.sleepTimer = 5;
    second.sleeping = true;
    second.sleepTimer = 5;

    addPhysics2DJoint(world, joint('Deferred', first.index, second.index));
    expect(first.sleeping).toBe(true);
    expect(second.sleeping).toBe(true);

    registerPhysics2DJointSolver(world, 'Deferred', { prepare: () => {}, solve: () => {} });
    expect(first.sleeping).toBe(false);
    expect(first.sleepTimer).toBe(0);
    expect(second.sleeping).toBe(false);
    expect(second.sleepTimer).toBe(0);
  });

  // Critic's repro: register the solver AFTER the joint is already in the world, and the kind's own
  // reversal must still run. Previously the generic swap had already happened at add time without the
  // kind's consent, so the directional field kept its authored sign forever.
  it('canonicalizes an already-added joint when its solver registers later, reversing direction', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, {
      ...joint('Directional', second.index, first.index, 7, 9),
      direction: 1,
    } as Physics2DJoint & { direction: number });

    registerPhysics2DJointSolver(world, 'Directional', {
      prepare: () => {},
      solve: () => {},
      swapEnds: (target) => {
        const directional = target as Physics2DJoint & { direction: number };
        directional.direction = -directional.direction;
        return true;
      },
    });

    expect(added.bodyA).toBe(first.index);
    expect(added.localAnchorAX).toBe(9);
    expect((added as Physics2DJoint & { direction: number }).direction).toBe(-1);
  });

  // A kind that vetoes the exchange must still be obeyed on the deferred path.
  it('honours a solver that vetoes the swap when it registers later', () => {
    const world = createPhysics2DWorld();
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Vetoing', second.index, first.index, 7, 9));

    registerPhysics2DJointSolver(world, 'Vetoing', {
      prepare: () => {},
      solve: () => {},
      swapEnds: () => false,
    });

    expect(added.bodyA).toBe(second.index);
    expect(added.localAnchorAX).toBe(7);
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

describe('invalidatePhysics2DJoint', () => {
  it('clears common and kind-owned impulses and wakes both participating bodies', () => {
    const world = createPhysics2DWorld();
    let cleared = 0;
    registerPhysics2DJointSolver(world, 'Test', {
      clearAccumulatedImpulses: (value) => {
        cleared++;
        value.impulse2 = 0;
      },
      prepare: () => {},
      solve: () => {},
    });
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Test', first.index, second.index));
    added.impulse0 = 10;
    added.impulse1 = 20;
    added.impulse2 = 30;
    first.sleeping = true;
    first.sleepTimer = 5;
    second.sleeping = true;
    second.sleepTimer = 5;

    expect(invalidatePhysics2DJoint(world, added)).toBe(true);

    expect(cleared).toBe(1);
    expect([added.impulse0, added.impulse1, added.impulse2]).toEqual([0, 0, 0]);
    expect(first.sleeping).toBe(false);
    expect(first.sleepTimer).toBe(0);
    expect(second.sleeping).toBe(false);
    expect(second.sleepTimer).toBe(0);
  });

  it('reports false without mutating a joint owned by another world', () => {
    const owner = createPhysics2DWorld();
    const other = createPhysics2DWorld();
    const first = body(owner, 0, 0);
    const second = body(owner, 2, 0);
    const added = addPhysics2DJoint(owner, joint('Unknown', first.index, second.index));
    added.impulse0 = 10;

    expect(invalidatePhysics2DJoint(other, added)).toBe(false);
    expect(added.impulse0).toBe(10);
  });

  it('reindexes collision suppression after an authored flag changes', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Test', { prepare: () => {}, solve: () => {} });
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Test', first.index, second.index));
    expect(world.jointCollisionSuppressions.get(first.index)?.get(second.index)).toBe(1);

    added.collideConnected = true;
    expect(invalidatePhysics2DJoint(world, added)).toBe(true);

    expect(world.jointCollisionSuppressions.get(first.index)?.get(second.index)).toBeUndefined();
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
  it('releases ownership so a detached joint may be inserted again', () => {
    const firstWorld = createPhysics2DWorld();
    const secondWorld = createPhysics2DWorld();
    const first = body(firstWorld, 0, 0);
    const second = body(firstWorld, 2, 0);
    const added = addPhysics2DJoint(firstWorld, joint('Unknown', first.index, second.index));

    removePhysics2DJoint(firstWorld, added);

    expect(addPhysics2DJoint(secondWorld, added)).toBe(added);
  });

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

  it('wakes both ends when an active constraint is removed', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Test', { prepare: () => {}, solve: () => {} });
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const added = addPhysics2DJoint(world, joint('Test', first.index, second.index));
    first.sleeping = true;
    first.sleepTimer = 5;
    second.sleeping = true;
    second.sleepTimer = 5;

    removePhysics2DJoint(world, added);

    expect(first.sleeping).toBe(false);
    expect(first.sleepTimer).toBe(0);
    expect(second.sleeping).toBe(false);
    expect(second.sleepTimer).toBe(0);
  });

  it('keeps a pair suppressed until its final suppressing joint is removed', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Test', { prepare: () => {}, solve: () => {} });
    const first = body(world, 0, 0);
    const second = body(world, 2, 0);
    const one = addPhysics2DJoint(world, joint('Test', first.index, second.index));
    const two = addPhysics2DJoint(world, joint('Test', first.index, second.index));
    expect(world.jointCollisionSuppressions.get(first.index)?.get(second.index)).toBe(2);

    removePhysics2DJoint(world, one);
    expect(world.jointCollisionSuppressions.get(first.index)?.get(second.index)).toBe(1);
    removePhysics2DJoint(world, two);
    expect(world.jointCollisionSuppressions.get(first.index)?.get(second.index)).toBeUndefined();
  });

  it('wakes the surviving end when its joint neighbour is removed from the world', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Test', { prepare: () => {}, solve: () => {} });
    const removed = body(world, 0, 0);
    const survivor = body(world, 2, 0);
    addPhysics2DJoint(world, joint('Test', removed.index, survivor.index));
    survivor.sleeping = true;
    survivor.sleepTimer = 5;

    removePhysics2DBody(world, removed);

    expect(survivor.sleeping).toBe(false);
    expect(survivor.sleepTimer).toBe(0);
  });
});
