import {
  createCollisionHeightfield3D,
  createCollisionTriangleMesh3D,
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { CollisionBuiltInShape3D, Physics3DMaterial, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPhysics3DBallAndSocketJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import { stepPhysics3D } from './step';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
  setPhysics3DBodyFixedRotation,
} from './world';

// Long-horizon qualification. These do not test one function; they test that the ASSEMBLED step stays
// finite, stays deterministic, and reuses its storage over thousands of solves — the failures that only
// appear after hundreds of steps and that a per-function test cannot reach.

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

const MATERIAL: Physics3DMaterial = { density: 1, friction: 0.4, restitution: 0 };

function boxShape(halfX: number, halfY: number, halfZ: number): CollisionBuiltInShape3D {
  return { kind: 'aabb', minX: -halfX, minY: -halfY, minZ: -halfZ, maxX: halfX, maxY: halfY, maxZ: halfZ };
}

function addCuboid(
  world: Physics3DWorld,
  type: RigidBody3D['type'],
  x: number,
  y: number,
  z: number,
  halfX: number,
  halfY: number,
  halfZ: number,
  material: Readonly<Physics3DMaterial> = MATERIAL,
): RigidBody3D {
  const body = createRigidBody3D(type);
  body.x = x;
  body.y = y;
  body.z = z;
  addPhysics3DBody(world, body);
  addPhysics3DCollider(world, body, createPhysics3DCollider(boxShape(halfX, halfY, halfZ), material));
  return body;
}

function addBox(
  world: Physics3DWorld,
  type: RigidBody3D['type'],
  x: number,
  y: number,
  z: number,
  half = 0.5,
  material: Readonly<Physics3DMaterial> = MATERIAL,
): RigidBody3D {
  return addCuboid(world, type, x, y, z, half, half, half, material);
}

function addSphere(
  world: Physics3DWorld,
  type: RigidBody3D['type'],
  x: number,
  y: number,
  z: number,
  radius = 0.25,
): RigidBody3D {
  const body = createRigidBody3D(type);
  body.x = x;
  body.y = y;
  body.z = z;
  addPhysics3DBody(world, body);
  addPhysics3DCollider(world, body, createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius }, MATERIAL));
  return body;
}

function addSlab(world: Physics3DWorld, halfX: number, halfY: number, halfZ: number, y: number): RigidBody3D {
  return addCuboid(world, 'static', 0, y, 0, halfX, halfY, halfZ);
}

function run(world: Physics3DWorld, steps: number): void {
  for (let i = 0; i < steps; i += 1) stepPhysics3D(world, 1 / 60);
}

// Every field the integrator writes. A NaN in ONE of them spreads to the rest within a step, so
// checking a subset would report health a step before the world dies.
function expectFiniteBody(body: Readonly<RigidBody3D>): void {
  expect([
    body.x,
    body.y,
    body.z,
    body.orientationX,
    body.orientationY,
    body.orientationZ,
    body.orientationW,
    body.velocityX,
    body.velocityY,
    body.velocityZ,
    body.angularVelocityX,
    body.angularVelocityY,
    body.angularVelocityZ,
  ]).toSatisfy((values: number[]) => values.every(Number.isFinite));
}

function snapshotWorld(world: Readonly<Physics3DWorld>): number[][] {
  return world.bodies.map((body) => [
    body.index,
    body.x,
    body.y,
    body.z,
    body.orientationX,
    body.orientationY,
    body.orientationZ,
    body.orientationW,
    body.velocityX,
    body.velocityY,
    body.velocityZ,
    body.angularVelocityX,
    body.angularVelocityY,
    body.angularVelocityZ,
    body.sleeping ? 1 : 0,
    body.sleepTimer,
  ]);
}

describe('physics3d stress qualification', () => {
  it('settles a distributed load across large accelerated mesh and heightfield terrain', { timeout: 15_000 }, () => {
    for (const surface of [
      createGridTriangleMesh(17, 17),
      createCollisionHeightfield3D(17, 17, new Array(17 * 17).fill(0)),
    ]) {
      const world = createPhysics3DWorld();
      const terrain = createRigidBody3D('static');
      terrain.colliders.push(createPhysics3DCollider(surface, MATERIAL));
      addPhysics3DBody(world, terrain);
      const bodies: RigidBody3D[] = [];
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          bodies.push(addBox(world, 'dynamic', 2.25 + column * 3.5, 2 + ((row + column) % 3), 2.25 + row * 3.5));
        }
      }

      run(world, 900);

      for (const body of bodies) {
        expectFiniteBody(body);
        expect(body.y).toBeGreaterThan(0.49);
        expect(body.y).toBeLessThan(0.52);
        expect(
          body.sleeping,
          JSON.stringify([body.y, body.velocityX, body.velocityY, body.velocityZ, body.sleepTimer]),
        ).toBe(true);
      }
    }
  });

  it('keeps a tall pile finite, ordered, and supported over a long settle horizon', () => {
    const world = createPhysics3DWorld();
    world.gravityY = -10;
    addSlab(world, 20, 1, 20, -1);
    // Boxed in on four sides, so the pile cannot walk sideways out of the test over 900 steps. The 2D
    // harness needs two walls; three dimensions need four.
    for (const [x, z, halfX, halfZ] of [
      [-1.02, 0, 0.5, 3],
      [1.02, 0, 0.5, 3],
      [0, -1.02, 3, 0.5],
      [0, 1.02, 3, 0.5],
    ]) {
      const wall = createRigidBody3D('static');
      wall.x = x;
      wall.z = z;
      wall.y = 10;
      addPhysics3DBody(world, wall);
      addPhysics3DCollider(world, wall, createPhysics3DCollider(boxShape(halfX, 11, halfZ), MATERIAL));
    }
    const pile: RigidBody3D[] = [];
    for (let i = 0; i < 12; i += 1) pile.push(addBox(world, 'dynamic', 0, 0.5 + i, 0));

    run(world, 900);

    for (const body of pile) expectFiniteBody(body);
    // Still stacked in the order they were built: nothing tunnelled past a neighbour.
    for (let i = 1; i < pile.length; i += 1) expect(pile[i].y).toBeGreaterThan(pile[i - 1].y);
    // The bottom box still rests on the floor rather than having sunk into it. The bound accommodates
    // platform-dependent convergence rates (~0.47 locally, ~0.43 on CI) while still catching the stale-
    // depth position correction bug that measured 0.23 of sink (pile[0].y ≈ 0.27).
    expect(pile[0].y).toBeGreaterThan(0.4);
    // And the pile has not collapsed: twelve unit boxes stand about twelve units tall. The per-contact
    // compression from the bottom-box bound (~0.07 on CI) compounds across all twelve contacts, so the
    // top box can settle as low as ~10.6 on CI while measuring ~11.1 locally. The bound still catches the
    // stale-depth bug, which compressed the pile to ~8.7.
    expect(pile[pile.length - 1].y).toBeGreaterThan(10.2);
    expect(
      pile.every((body) => body.sleeping),
      JSON.stringify(
        pile.map((body) => [
          body.y,
          body.sleeping,
          body.sleepTimer,
          body.velocityX,
          body.velocityY,
          body.velocityZ,
          body.angularVelocityX,
          body.angularVelocityY,
          body.angularVelocityZ,
        ]),
      ),
    ).toBe(true);
  });

  it('keeps a driven ball-and-socket chain bounded over thousands of constraint solves', () => {
    const world = createPhysics3DWorld();
    world.gravityY = -10;
    registerBuiltInPhysics3DJointSolvers(world);
    const links: RigidBody3D[] = [addSphere(world, 'static', 0, 8, 0)];
    for (let i = 1; i <= 12; i += 1) {
      const link = addSphere(world, 'dynamic', 0, 8 - i, 0);
      links.push(link);
      addPhysics3DJoint(
        world,
        createPhysics3DBallAndSocketJoint({
          bodyA: links[i - 1].index,
          bodyB: link.index,
          localAnchorAY: -0.5,
          localAnchorBY: 0.5,
        }),
      );
    }
    // Pushed sideways AND out of plane, so a chain that only stayed bounded in a plane would fail here.
    links[links.length - 1].velocityX = 4;
    links[links.length - 1].velocityZ = 3;

    run(world, 1200);

    for (const body of links) expectFiniteBody(body);
    let maximumLinkError = 0;
    for (let i = 1; i < links.length; i += 1) {
      const dx = links[i].x - links[i - 1].x;
      const dy = links[i].y - links[i - 1].y;
      const dz = links[i].z - links[i - 1].z;
      maximumLinkError = Math.max(maximumLinkError, Math.abs(Math.hypot(dx, dy, dz) - 1));
    }
    // Measured worst case is about 0.0214 world units at the driven end of the chain.
    expect(maximumLinkError).toBeLessThan(0.025);
    expect(Math.hypot(links[links.length - 1].x, links[links.length - 1].z)).toBeLessThan(15);
  });

  it('supports ordinary and adversarial mass ratios within a declared compression envelope', () => {
    function stackedPair(ratio: number, substeps: number): readonly [RigidBody3D, RigidBody3D] {
      const world = createPhysics3DWorld();
      world.gravityY = -10;
      world.config.substeps = substeps;
      addSlab(world, 5, 1, 5, -1);
      const lower = addBox(world, 'dynamic', 0, 0.5, 0);
      const upper = addBox(world, 'dynamic', 0, 1.5, 0, 0.5, {
        density: ratio,
        friction: MATERIAL.friction,
        restitution: 0,
      });
      // This is a mass-ratio test, not a balance test: removing rotation isolates the normal rows from
      // the physically legitimate top-heavy stack tipping under microscopic lateral perturbations.
      setPhysics3DBodyFixedRotation(lower, true);
      setPhysics3DBodyFixedRotation(upper, true);
      run(world, 600);
      return [lower, upper];
    }

    // Default tuning owns the ordinary envelope; four substeps are the published lever for the 1000:1
    // adversarial case. Both retain at least 99% of the one-unit centre separation and come to rest.
    for (const [ratio, substeps] of [
      [100, 1],
      [1000, 4],
    ] as const) {
      const [lower, upper] = stackedPair(ratio, substeps);
      expectFiniteBody(lower);
      expectFiniteBody(upper);
      expect(lower.y).toBeGreaterThan(0.49);
      expect(upper.y - lower.y).toBeGreaterThan(0.99);
      expect(lower.sleeping).toBe(true);
      expect(upper.sleeping).toBe(true);
    }
  });

  it('keeps restitution energy and a centred contact torque bounded over sixty seconds', () => {
    const world = createPhysics3DWorld();
    world.gravityY = 0;
    const elastic: Physics3DMaterial = { density: 1, friction: 0, restitution: 1 };
    addCuboid(world, 'static', -5.25, 0, 0, 0.25, 5, 5, elastic);
    addCuboid(world, 'static', 5.25, 0, 0, 0.25, 5, 5, elastic);
    const ball = createRigidBody3D('dynamic');
    ball.sleepEnabled = false;
    ball.velocityX = 6;
    addPhysics3DBody(world, ball);
    addPhysics3DCollider(
      world,
      ball,
      createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 0.25 }, elastic),
    );

    run(world, 3600);

    expectFiniteBody(ball);
    expect(Math.abs(ball.x)).toBeLessThanOrEqual(4.81);
    expect(Math.hypot(ball.velocityX, ball.velocityY, ball.velocityZ)).toBeCloseTo(6, 9);
    // A centre-line hit has no torque. This bound caught the flat face's arbitrary support corner being
    // averaged into the fallback point, which spun the sphere and let it escape the corridor.
    expect(Math.hypot(ball.angularVelocityX, ball.angularVelocityY, ball.angularVelocityZ)).toBeLessThan(1e-9);
  });

  it('makes long-horizon Coulomb friction isotropic in the contact plane', () => {
    function slide(diagonal: boolean): readonly [number, number, number] {
      const world = createPhysics3DWorld();
      world.gravityY = -10;
      addSlab(world, 100, 1, 100, -1);
      const body = addBox(world, 'dynamic', 0, 0.5, 0);
      setPhysics3DBodyFixedRotation(body, true);
      const component = diagonal ? 5 / Math.SQRT2 : 5;
      body.velocityX = component;
      body.velocityZ = diagonal ? component : 0;
      run(world, 240);
      expect(Math.hypot(body.velocityX, body.velocityZ)).toBeLessThan(1e-9);
      return [body.x, body.z, Math.hypot(body.x, body.z)];
    }

    const axis = slide(false);
    const diagonal = slide(true);
    expect(Math.abs(axis[1])).toBeLessThan(0.001);
    expect(Math.abs(diagonal[0] - diagonal[1])).toBeLessThan(0.001);
    expect(Math.abs(axis[2] - diagonal[2])).toBeLessThan(0.005);
  });

  it('produces an exact repeat trace for a mixed pile, joint, and sleep scene', () => {
    // EXACT equality, not approximate. Determinism is a property of the arithmetic and the iteration
    // order; a tolerance here would pass with the contact sort removed, which is precisely the bug this
    // is watching for.
    function scene(): Physics3DWorld {
      const world = createPhysics3DWorld();
      world.gravityY = -10;
      registerBuiltInPhysics3DJointSolvers(world);
      addSlab(world, 10, 1, 10, -1);
      const first = addBox(world, 'dynamic', -1, 0.5, 0);
      const second = addBox(world, 'dynamic', -1, 1.5, 0);
      addPhysics3DJoint(
        world,
        createPhysics3DBallAndSocketJoint({
          bodyA: first.index,
          bodyB: second.index,
          localAnchorAY: 0.5,
          localAnchorBY: -0.5,
        }),
      );
      addBox(world, 'dynamic', 2, 0.5, 0);
      addBox(world, 'dynamic', 2, 0.5, 2);
      const thrown = addSphere(world, 'dynamic', -8, 3, 0);
      thrown.gravityScale = 0;
      thrown.velocityX = 20;
      return world;
    }

    const first = scene();
    const second = scene();
    for (let i = 0; i < 480; i += 1) {
      stepPhysics3D(first, 1 / 60);
      stepPhysics3D(second, 1 / 60);
    }

    expect(snapshotWorld(first)).toEqual(snapshotWorld(second));
  });

  it('produces the same trace whichever order two independent piles were inserted in', () => {
    // The other half of determinism, and the one an exact-repeat test cannot see: the contact LIST is
    // sorted precisely so that insertion history stops mattering. Two disjoint piles built in opposite
    // orders must settle identically.
    function scene(reversed: boolean): number[] {
      const world = createPhysics3DWorld();
      world.gravityY = -10;
      addSlab(world, 20, 1, 20, -1);
      const columns = reversed ? [6, -6] : [-6, 6];
      const tracked: RigidBody3D[] = [];
      for (const x of columns) {
        for (let i = 0; i < 3; i += 1) tracked.push(addBox(world, 'dynamic', x, 0.5 + i, 0));
      }
      run(world, 300);
      // Reported by POSITION rather than by insertion index, since the two scenes number their bodies
      // differently on purpose.
      return tracked
        .map((body) => [Math.round(body.x), body.y] as const)
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .map(([, y]) => y);
    }

    const forward = scene(false);
    const backward = scene(true);
    expect(forward).toHaveLength(6);
    for (let i = 0; i < forward.length; i += 1) expect(backward[i]).toBeCloseTo(forward[i], 9);
  });

  it('retains stable-topology contacts and every world-owned island workspace object', () => {
    const world = createPhysics3DWorld();
    world.gravityY = -10;
    addSlab(world, 5, 1, 5, -1);
    addBox(world, 'dynamic', 0, 0.5, 0);
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

    // Contact IDENTITY survives: the same record and the same point array, which is what the solver's
    // warm-start accumulators are matched against. A contact rebuilt each step would settle far slower
    // while every per-step assertion still passed.
    expect(world.contacts[0]).toBe(contact);
    expect(world.contacts[0].points).toBe(points);
    const retained = [
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
    for (let i = 0; i < workspace.length; i += 1) expect(retained[i]).toBe(workspace[i]);
  });

  it('keeps a spinning asymmetric body finite, with a drift that halves as the timestep does', () => {
    // The 3D-only failure mode, with no 2D counterpart: a body whose inertia tensor is not isotropic
    // precesses, and the gyroscopic term that produces it is integrated EXPLICITLY. So the test is not
    // that angular momentum is conserved — it is not, at a game timestep — but that the error behaves
    // like discretization error and not like a wrong term. Halving the sub-interval must roughly halve
    // the drift; a wrong term converges to the wrong answer instead, however fine the steps.
    const drifts = [1, 2, 4].map((substeps) => {
      const world = createPhysics3DWorld();
      world.gravityY = 0;
      world.config.substeps = substeps;
      const body = createRigidBody3D('dynamic');
      addPhysics3DBody(world, body);
      addPhysics3DCollider(world, body, createPhysics3DCollider(boxShape(2, 0.5, 1), MATERIAL));
      body.sleepEnabled = false;
      body.angularVelocityX = 3;
      body.angularVelocityY = 0.2;
      body.angularVelocityZ = 0.1;

      const initial = angularMomentumMagnitude(body);
      run(world, 1200);

      expectFiniteBody(body);
      // The quaternion must stay on the unit sphere; renormalization drift shows up here first.
      expect(Math.hypot(body.orientationX, body.orientationY, body.orientationZ, body.orientationW)).toBeCloseTo(1, 6);
      return Math.abs(angularMomentumMagnitude(body) / initial - 1);
    });

    // Roughly first order: each halving of the sub-interval cuts the drift at least a third.
    expect(drifts[1]).toBeLessThan(drifts[0] * 0.7);
    expect(drifts[2]).toBeLessThan(drifts[1] * 0.7);
    expect(drifts[2]).toBeLessThan(0.05);
  });
});

function createGridTriangleMesh(columns: number, rows: number) {
  const points = new Array<number>(columns * rows * 3);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const offset = (row * columns + column) * 3;
      points[offset] = column;
      points[offset + 1] = 0;
      points[offset + 2] = row;
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const lowerLeft = row * columns + column;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + columns;
      const upperRight = upperLeft + 1;
      indices.push(lowerLeft, upperRight, lowerRight, lowerLeft, upperLeft, upperRight);
    }
  }
  return createCollisionTriangleMesh3D(points, indices);
}

// |I * omega|, which is conserved for torque-free motion.
//
// OMEGA IS ROTATED INTO THE BODY FRAME FIRST, and that step is the whole correctness of this function.
// `body.angularVelocity*` is world-frame while `body.inertia*` is the LOCAL tensor; multiplying them
// directly mixes two frames and produces a quantity that is conserved by nothing. It reads as a 40%
// growth that gets WORSE with more substeps — a signature that looks exactly like a wrong gyroscopic
// term and is really a wrong observable.
function angularMomentumMagnitude(body: Readonly<RigidBody3D>): number {
  const qX = -body.orientationX;
  const qY = -body.orientationY;
  const qZ = -body.orientationZ;
  const qW = body.orientationW;
  const x = body.angularVelocityX;
  const y = body.angularVelocityY;
  const z = body.angularVelocityZ;
  const tX = 2 * (qY * z - qZ * y);
  const tY = 2 * (qZ * x - qX * z);
  const tZ = 2 * (qX * y - qY * x);
  const wX = x + qW * tX + qY * tZ - qZ * tY;
  const wY = y + qW * tY + qZ * tX - qX * tZ;
  const wZ = z + qW * tZ + qX * tY - qY * tX;

  return Math.hypot(
    body.inertiaXX * wX + body.inertiaXY * wY + body.inertiaXZ * wZ,
    body.inertiaXY * wX + body.inertiaYY * wY + body.inertiaYZ * wZ,
    body.inertiaXZ * wX + body.inertiaYZ * wY + body.inertiaZZ * wZ,
  );
}
