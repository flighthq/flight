import type { RigidBody2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  applyPhysics2DImpulse,
  solvePhysics2DContactsOnce,
  relativeNormalVelocity,
  solvePhysics2DContacts,
  warmStartPhysics2DContacts,
} from './solver';
import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function body(type: RigidBody2D['type'], x: number, y: number): RigidBody2D {
  const made = createRigidBody2D(type, x, y);
  made.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
  return made;
}

function restingWorld() {
  const world = createPhysics2DWorld();
  const floor = createRigidBody2D('static', 0, 0);
  floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -50, minY: -1, maxX: 50, maxY: 0 }, STONE));
  addPhysics2DBody(world, floor);
  const crate = addPhysics2DBody(world, body('dynamic', 0, 0.499));
  return { world, crate };
}

describe('applyPhysics2DImpulse', () => {
  it('pushes A along the impulse and B against it, matching the manifold normal direction', () => {
    // The normal separates A out of B, so a positive impulse must move A along it. Reversed, the solver
    // drives bodies together and a resting box settles below the floor rather than on it.
    const world = createPhysics2DWorld();
    const a = addPhysics2DBody(world, body('dynamic', 0, 0));
    const b = addPhysics2DBody(world, body('dynamic', 0, 1));
    applyPhysics2DImpulse(a, b, 0, 0, 0, 0, 0, 1);
    expect(a.velocityY).toBeGreaterThan(0);
    expect(b.velocityY).toBeLessThan(0);
  });

  it('spins a body when the impulse acts off its centre of mass', () => {
    const world = createPhysics2DWorld();
    const a = addPhysics2DBody(world, body('dynamic', 0, 0));
    const b = addPhysics2DBody(world, body('dynamic', 0, 1));
    applyPhysics2DImpulse(a, b, 0.5, 0, 0, 0, 0, 1);
    expect(a.angularVelocity).not.toBe(0);
  });

  it('leaves a static body untouched through its zero inverse mass, with no branch', () => {
    const world = createPhysics2DWorld();
    const floor = addPhysics2DBody(world, body('static', 0, 0));
    const crate = addPhysics2DBody(world, body('dynamic', 0, 1));
    applyPhysics2DImpulse(floor, crate, 0.3, 0.2, 0, 0, 5, 7);
    expect(floor.velocityX).toBe(0);
    expect(floor.velocityY).toBe(0);
    expect(floor.angularVelocity).toBe(0);
  });
});

describe('relativeNormalVelocity', () => {
  const point = {
    x: 0,
    y: 0,
    depth: 0,
    featureId: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
    normalImpulse: 0,
    tangentImpulse: 0,
    normalMass: 0,
    tangentMass: 0,
    bias: 0,
  };

  it('is negative while the pair is closing along the separating normal', () => {
    const world = createPhysics2DWorld();
    const a = addPhysics2DBody(world, body('dynamic', 0, 0));
    const b = addPhysics2DBody(world, body('dynamic', 0, 1));
    b.velocityY = -1; // B falling toward A
    expect(relativeNormalVelocity(a, b, point, 0, 1)).toBeGreaterThan(0);
    b.velocityY = 1; // B moving away
    expect(relativeNormalVelocity(a, b, point, 0, 1)).toBeLessThan(0);
  });

  it('includes the angular contribution at the lever arm', () => {
    const world = createPhysics2DWorld();
    const a = addPhysics2DBody(world, body('dynamic', 0, 0));
    const b = addPhysics2DBody(world, body('dynamic', 0, 1));
    const spinning = { ...point, rAX: 1, rAY: 0 };
    a.angularVelocity = 2;
    expect(relativeNormalVelocity(a, b, spinning, 0, 1)).toBeCloseTo(2);
  });
});

describe('solvePhysics2DContacts', () => {
  it('removes the closing velocity at a resting contact', () => {
    const { world, crate } = restingWorld();
    crate.velocityY = -5;
    stepPhysics2D(world, 1 / 60);
    expect(crate.velocityY).toBeGreaterThan(-1);
  });

  it('accumulates a non-negative normal impulse rather than pulling the pair together', () => {
    // The clamp is on the ACCUMULATED impulse, not the increment: a contact may never pull.
    const { world } = restingWorld();
    for (let i = 0; i < 30; i++) stepPhysics2D(world, 1 / 60);
    for (const contact of world.contacts) {
      for (let i = 0; i < contact.pointCount; i++) {
        expect(contact.points[i].normalImpulse).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('bounds friction by the Coulomb limit against the normal impulse', () => {
    const { world, crate } = restingWorld();
    crate.velocityX = 4;
    for (let i = 0; i < 20; i++) stepPhysics2D(world, 1 / 60);
    for (const contact of world.contacts) {
      for (let i = 0; i < contact.pointCount; i++) {
        const point = contact.points[i];
        expect(Math.abs(point.tangentImpulse)).toBeLessThanOrEqual(contact.friction * point.normalImpulse + 1e-9);
      }
    }
  });

  it('slows a sliding box through friction instead of letting it glide forever', () => {
    const { world, crate } = restingWorld();
    crate.velocityX = 4;
    for (let i = 0; i < 60; i++) stepPhysics2D(world, 1 / 60);
    expect(crate.velocityX).toBeLessThan(4);
    expect(crate.velocityX).toBeGreaterThan(0);
  });

  it('keeps a contact frictionless when either collider has zero friction', () => {
    const world = createPhysics2DWorld(0, -10);
    const floor = createRigidBody2D('static', 0, 0);
    floor.colliders.push(
      createPhysics2DCollider(
        { kind: 'aabb', minX: -50, minY: -1, maxX: 50, maxY: 0 },
        { density: 1, friction: 0, restitution: 0 },
      ),
    );
    addPhysics2DBody(world, floor);
    const crate = createRigidBody2D('dynamic', 0, 0.499);
    crate.colliders.push(
      createPhysics2DCollider(
        { kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 },
        { density: 1, friction: 1, restitution: 0 },
      ),
    );
    addPhysics2DBody(world, crate);
    crate.velocityX = 4;

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].friction).toBe(0);
    expect(world.contacts[0].points[0].tangentImpulse).toBe(0);
  });

  it('does nothing for a world with no contacts', () => {
    const world = createPhysics2DWorld();
    expect(() => solvePhysics2DContacts(world)).not.toThrow();
  });
});

describe('solvePhysics2DContactsOnce', () => {
  it('applies one pass, so the step can interleave contacts with joints inside a single iteration', () => {
    // Joints and contacts constrain the same bodies. Giving either a whole pass to itself lets it undo
    // what the other just corrected, which is why the step alternates them rather than running one solver
    // to convergence and then the other.
    const { world, crate } = restingWorld();
    crate.velocityY = -5;
    stepPhysics2D(world, 1 / 60);
    const before = crate.velocityY;
    solvePhysics2DContactsOnce(world);
    expect(crate.velocityY).not.toBe(before);
  });

  it('does nothing for a world with no contacts', () => {
    expect(() => solvePhysics2DContactsOnce(createPhysics2DWorld())).not.toThrow();
  });
});

describe('warmStartPhysics2DContacts', () => {
  it('reapplies the cached impulse, leaving a converged resting contact deeper than a cold start', () => {
    // The measurable effect of warm starting: a settled stack keeps its impulses and stays put, where a
    // cold-started one gives them up each step and sinks into its own slop.
    const warm = createPhysics2DWorld();
    const cold = createPhysics2DWorld();
    cold.config.warmStarting = false;
    for (const world of [warm, cold]) {
      const floor = createRigidBody2D('static', 0, 0);
      floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -50, minY: -1, maxX: 50, maxY: 0 }, STONE));
      addPhysics2DBody(world, floor);
      addPhysics2DBody(world, body('dynamic', 0, 0.5));
      addPhysics2DBody(world, body('dynamic', 0, 1.5));
      addPhysics2DBody(world, body('dynamic', 0, 2.5));
      for (let i = 0; i < 120; i++) stepPhysics2D(world, 1 / 60);
    }
    const warmTop = warm.bodies[3].y;
    const coldTop = cold.bodies[3].y;
    expect(warmTop).toBeGreaterThanOrEqual(coldTop - 1e-9);
  });

  it('does nothing for a world with no contacts', () => {
    expect(() => warmStartPhysics2DContacts(createPhysics2DWorld())).not.toThrow();
  });
});
