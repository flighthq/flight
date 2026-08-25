import type { Physics2DWorld, RigidBody2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics2DDistanceJoint } from './jointFactories';
import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import { Physics2DDistanceJointKind, physics2DDistanceJointSolver } from './joints';
import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const MATERIAL = { density: 1, friction: 0.4, restitution: 0 };

function addBox(world: Physics2DWorld, type: RigidBody2D['type'], x: number, y: number, half = 0.5): RigidBody2D {
  const body = createRigidBody2D(type, x, y);
  body.colliders.push(
    createPhysics2DCollider({ kind: 'aabb', minX: -half, minY: -half, maxX: half, maxY: half }, MATERIAL),
  );
  return addPhysics2DBody(world, body);
}

function addCircle(world: Physics2DWorld, type: RigidBody2D['type'], x: number, y: number, radius = 0.2): RigidBody2D {
  const body = createRigidBody2D(type, x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius }, MATERIAL));
  return addPhysics2DBody(world, body);
}

function run(world: Physics2DWorld, steps: number): void {
  for (let i = 0; i < steps; i++) stepPhysics2D(world, 1 / 60);
}

function expectFiniteBody(body: Readonly<RigidBody2D>): void {
  expect([
    body.x,
    body.y,
    body.angle,
    body.velocityX,
    body.velocityY,
    body.angularVelocity,
    body.mass,
    body.inertia,
  ]).toSatisfy((values: number[]) => values.every(Number.isFinite));
}

describe('physics2d stress qualification', () => {
  it('keeps a tall pile finite, ordered, and supported over a long settle horizon', () => {
    const world = createPhysics2DWorld(0, -10);
    const floor = createRigidBody2D('static', 0, 0);
    floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -20, minY: -1, maxX: 20, maxY: 0 }, MATERIAL));
    addPhysics2DBody(world, floor);
    for (const bounds of [
      { minX: -1, minY: 0, maxX: -0.51, maxY: 20 },
      { minX: 0.51, minY: 0, maxX: 1, maxY: 20 },
    ]) {
      const wall = createRigidBody2D('static', 0, 0);
      wall.colliders.push(createPhysics2DCollider({ kind: 'aabb', ...bounds }, MATERIAL));
      addPhysics2DBody(world, wall);
    }
    const pile: RigidBody2D[] = [];
    for (let i = 0; i < 16; i++) pile.push(addBox(world, 'dynamic', 0, 0.5 + i));

    run(world, 900);

    for (const body of pile) expectFiniteBody(body);
    for (let i = 1; i < pile.length; i++) expect(pile[i].y).toBeGreaterThan(pile[i - 1].y);
    // The bound accommodates platform-dependent convergence rates while still catching a stale-depth
    // position correction bug. Per-contact compression compounds across all sixteen contacts.
    expect(pile[0].y).toBeGreaterThan(0.4);
    expect(pile[pile.length - 1].y).toBeGreaterThan(13.5);
    expect(pile.every((body) => body.sleeping)).toBe(true);
  });

  it('keeps a driven distance-joint chain bounded over thousands of constraint solves', () => {
    const world = createPhysics2DWorld(0, -10);
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const links: RigidBody2D[] = [addCircle(world, 'static', 0, 8)];
    for (let i = 1; i <= 14; i++) {
      const link = addCircle(world, 'dynamic', 0, 8 - i);
      links.push(link);
      addPhysics2DJoint(
        world,
        createPhysics2DDistanceJoint({ bodyA: links[i - 1].index, bodyB: link.index, length: 1 }),
      );
    }
    links[links.length - 1].velocityX = 4;

    run(world, 1200);

    for (const body of links) expectFiniteBody(body);
    for (let i = 1; i < links.length; i++) {
      const dx = links[i].x - links[i - 1].x;
      const dy = links[i].y - links[i - 1].y;
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 1);
    }
    expect(Math.abs(links[links.length - 1].x)).toBeLessThan(15);
  });

  it('produces an exact repeat trace for a mixed pile, joint, sleep, and bullet scene', () => {
    function scene(): Physics2DWorld {
      const world = createPhysics2DWorld(0, -10);
      registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
      const floor = createRigidBody2D('static', 0, 0);
      floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -10, minY: -1, maxX: 10, maxY: 0 }, MATERIAL));
      addPhysics2DBody(world, floor);
      const first = addBox(world, 'dynamic', -1, 0.5);
      const second = addBox(world, 'dynamic', -1, 1.5);
      addPhysics2DJoint(world, createPhysics2DDistanceJoint({ bodyA: first.index, bodyB: second.index, length: 1 }));
      addBox(world, 'dynamic', 2, 0.5);
      const bullet = addCircle(world, 'dynamic', -8, 3, 0.25);
      bullet.bullet = true;
      bullet.gravityScale = 0;
      bullet.velocityX = 90;
      addBox(world, 'static', 0, 3, 0.25);
      return world;
    }

    const first = scene();
    const second = scene();
    for (let i = 0; i < 480; i++) {
      stepPhysics2D(first, 1 / 60);
      stepPhysics2D(second, 1 / 60);
    }

    expect(snapshotWorld(first)).toEqual(snapshotWorld(second));
  });

  it('retains stable-topology contacts and every world-owned island workspace object', () => {
    const world = createPhysics2DWorld(0, -10);
    const floor = createRigidBody2D('static', 0, 0);
    floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 }, MATERIAL));
    addPhysics2DBody(world, floor);
    addBox(world, 'dynamic', 0, 0.5);
    run(world, 240);
    expect(world.contacts).toHaveLength(1);
    const contact = world.contacts[0];
    const points = contact.points;
    const workspace = [
      world.islandParents,
      world.islandSleepTimers,
      world.solveIslandByRoot,
      world.solveIslandRoots,
      world.solveIslandBodyStarts,
      world.solveIslandBodyCounts,
      world.solveIslandContactStarts,
      world.solveIslandContactCounts,
      world.solveIslandJointStarts,
      world.solveIslandJointCounts,
      world.solveIslandBodyIndices,
      world.solveIslandContactIndices,
      world.solveIslandJointIndices,
      world.solveIslandCursors,
    ];

    run(world, 600);

    expect(world.contacts[0]).toBe(contact);
    expect(world.contacts[0].points).toBe(points);
    const retainedWorkspace = [
      world.islandParents,
      world.islandSleepTimers,
      world.solveIslandByRoot,
      world.solveIslandRoots,
      world.solveIslandBodyStarts,
      world.solveIslandBodyCounts,
      world.solveIslandContactStarts,
      world.solveIslandContactCounts,
      world.solveIslandJointStarts,
      world.solveIslandJointCounts,
      world.solveIslandBodyIndices,
      world.solveIslandContactIndices,
      world.solveIslandJointIndices,
      world.solveIslandCursors,
    ];
    for (let i = 0; i < workspace.length; i++) expect(retainedWorkspace[i]).toBe(workspace[i]);
  });
});

function snapshotWorld(world: Readonly<Physics2DWorld>): number[][] {
  return world.bodies.map((body) => [
    body.index,
    body.x,
    body.y,
    body.angle,
    body.velocityX,
    body.velocityY,
    body.angularVelocity,
    body.sleeping ? 1 : 0,
    body.sleepTimer,
  ]);
}
