import type { Physics3DContact, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { refreshRigidBody3DWorldInertia } from './integrate';
import {
  buildPhysics3DSolveIslands,
  isRigidBody3DPairAwake,
  setPhysics3DJointResolutionGuard,
  updatePhysics3DSleep,
} from './islands';
import { computePhysics3DBoxMassData, createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D, setPhysics3DBodyType } from './world';

describe('buildPhysics3DSolveIslands', () => {
  it('admits every awake dynamic body', () => {
    const world = createPhysics3DWorld();
    createBox(world);
    createBox(world);
    updatePhysics3DSleep(world, 0);
    buildPhysics3DSolveIslands(world);

    expect(world.solveIslandBodyIndices).toHaveLength(2);
  });

  it('separates unconnected bodies into distinct islands', () => {
    const world = createPhysics3DWorld();
    createBox(world);
    createBox(world);
    updatePhysics3DSleep(world, 0);
    buildPhysics3DSolveIslands(world);

    expect(world.solveIslandRoots).toHaveLength(2);
    expect(world.solveIslandBodyCounts).toEqual([1, 1]);
  });

  it('merges bodies joined by a contact into one island', () => {
    const world = createPhysics3DWorld();
    const a = createBox(world);
    const b = createBox(world);
    world.contacts.push(createContact(a.index, b.index));
    updatePhysics3DSleep(world, 0);
    buildPhysics3DSolveIslands(world);

    expect(world.solveIslandRoots).toHaveLength(1);
    expect(world.solveIslandBodyCounts).toEqual([2]);
    expect(world.solveIslandContactCounts).toEqual([1]);
  });

  it('does not bridge two stacks through shared static ground', () => {
    // The failure this guards: static bodies joining islands would merge every stack resting on the
    // same floor into one world-sized island that can only sleep when the whole level stops.
    const world = createPhysics3DWorld();
    const ground = createBox(world);
    setPhysics3DBodyType(ground, 'static');
    const left = createBox(world);
    const right = createBox(world);
    world.contacts.push(createContact(ground.index, left.index));
    world.contacts.push(createContact(ground.index, right.index));
    updatePhysics3DSleep(world, 0);
    buildPhysics3DSolveIslands(world);

    expect(world.solveIslandRoots).toHaveLength(2);
  });

  it('excludes static and sleeping bodies from the workspace', () => {
    const world = createPhysics3DWorld();
    const dynamic = createBox(world);
    const ground = createBox(world);
    setPhysics3DBodyType(ground, 'static');
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);
    buildPhysics3DSolveIslands(world);

    expect(dynamic.sleeping).toBe(true);
    expect(world.solveIslandBodyIndices).toHaveLength(0);
    expect(world.solveIslandRoots).toHaveLength(0);
  });

  it('gives each island a contiguous, non-overlapping slice', () => {
    const world = createPhysics3DWorld();
    const a = createBox(world);
    const b = createBox(world);
    createBox(world);
    world.contacts.push(createContact(a.index, b.index));
    updatePhysics3DSleep(world, 0);
    buildPhysics3DSolveIslands(world);

    const seen = new Set<number>();
    for (let island = 0; island < world.solveIslandRoots.length; island += 1) {
      const start = world.solveIslandBodyStarts[island];
      for (let i = 0; i < world.solveIslandBodyCounts[island]; i += 1) {
        const value = world.solveIslandBodyIndices[start + i];
        expect(seen.has(value)).toBe(false);
        seen.add(value);
      }
    }
    expect(seen.size).toBe(3);
  });

  it('skips a contact whose bodies are all asleep or static', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    const ground = createBox(world);
    setPhysics3DBodyType(ground, 'static');
    world.contacts.push(createContact(body.index, ground.index));
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);
    buildPhysics3DSolveIslands(world);

    expect(world.solveIslandContactIndices).toHaveLength(0);
  });

  it('refills in place rather than growing across rebuilds', () => {
    const world = createPhysics3DWorld();
    createBox(world);
    createBox(world);
    updatePhysics3DSleep(world, 0);
    buildPhysics3DSolveIslands(world);
    const first = world.solveIslandBodyIndices.length;
    buildPhysics3DSolveIslands(world);

    expect(world.solveIslandBodyIndices).toHaveLength(first);
  });
});

describe('isRigidBody3DPairAwake', () => {
  it('is true while either end can still move', () => {
    const world = createPhysics3DWorld();
    const awake = createBox(world);
    const asleep = createBox(world);
    asleep.sleeping = true;

    expect(isRigidBody3DPairAwake(awake, asleep)).toBe(true);
    expect(isRigidBody3DPairAwake(asleep, awake)).toBe(true);
  });

  it('is false for two sleeping bodies', () => {
    const world = createPhysics3DWorld();
    const a = createBox(world);
    const b = createBox(world);
    a.sleeping = true;
    b.sleeping = true;

    expect(isRigidBody3DPairAwake(a, b)).toBe(false);
  });

  it('is false for a sleeper resting on static scenery', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    const ground = createBox(world);
    setPhysics3DBodyType(ground, 'static');
    body.sleeping = true;

    expect(isRigidBody3DPairAwake(body, ground)).toBe(false);
  });
});

describe('setPhysics3DJointResolutionGuard', () => {
  it('installs and clears the optional island-build seam', () => {
    const world = createPhysics3DWorld();
    createBox(world);
    let calls = 0;
    setPhysics3DJointResolutionGuard(() => {
      calls += 1;
    });

    try {
      buildPhysics3DSolveIslands(world);
    } finally {
      setPhysics3DJointResolutionGuard(null);
    }
    buildPhysics3DSolveIslands(world);

    expect(calls).toBe(1);
  });
});

describe('updatePhysics3DSleep', () => {
  it('sleeps a still body once it has been settled for timeToSleep', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    updatePhysics3DSleep(world, world.config.timeToSleep + 0.001);

    expect(body.sleeping).toBe(true);
  });

  it('zeroes velocity on sleeping so a woken body does not resume stale motion', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);
    body.velocityX = 0; // already zeroed; assert the angular axes too
    updatePhysics3DSleep(world, 0);

    expect(body.velocityX).toBe(0);
    expect(body.velocityY).toBe(0);
    expect(body.velocityZ).toBe(0);
    expect(body.angularVelocityX).toBe(0);
    expect(body.angularVelocityY).toBe(0);
    expect(body.angularVelocityZ).toBe(0);
  });

  it('keeps a moving body awake', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    body.velocityX = 10;
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
  });

  it('treats angular velocity as a magnitude, not per axis', () => {
    // Three axes each just under the threshold is a body tumbling at sqrt(3) times it.
    const world = createPhysics3DWorld();
    const body = createBox(world);
    const perAxis = world.config.sleepAngularThreshold * 0.9;
    body.angularVelocityX = perAxis;
    body.angularVelocityY = perAxis;
    body.angularVelocityZ = perAxis;
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(body.sleeping).toBe(false);
  });

  it('treats an applied force as motion even before it becomes velocity', () => {
    // A sleeper skips the integration that would turn force into velocity, and the step clears forces
    // at the end — so a body under continuous load would silently swallow every push.
    const world = createPhysics3DWorld();
    const body = createBox(world);
    body.forceY = 100;
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(body.sleeping).toBe(false);
  });

  it('treats an applied torque as motion', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    body.torqueZ = 100;
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(body.sleeping).toBe(false);
  });

  it('keeps a whole island awake while any one member still moves', () => {
    // The failure this guards: a settled crate sleeping while the crate it rests on slides out.
    const world = createPhysics3DWorld();
    const settled = createBox(world);
    const moving = createBox(world);
    moving.velocityX = 10;
    world.contacts.push(createContact(settled.index, moving.index));
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(settled.sleeping).toBe(false);
    expect(moving.sleeping).toBe(false);
  });

  it('sleeps an island only once every member has settled', () => {
    const world = createPhysics3DWorld();
    const a = createBox(world);
    const b = createBox(world);
    b.velocityX = 10;
    world.contacts.push(createContact(a.index, b.index));
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);
    expect(a.sleeping).toBe(false);

    b.velocityX = 0;
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);
    expect(a.sleeping).toBe(true);
    expect(b.sleeping).toBe(true);
  });

  it('keeps a rider awake on a moving kinematic platform', () => {
    // Kinematic bodies deliberately join islands. Excluding them the way static bodies are excluded
    // would let this crate sleep while the lift is still travelling.
    const world = createPhysics3DWorld();
    const crate = createBox(world);
    const lift = createBox(world);
    setPhysics3DBodyType(lift, 'kinematic');
    lift.velocityY = 5;
    world.contacts.push(createContact(crate.index, lift.index));
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(crate.sleeping).toBe(false);
  });

  it('wakes everything when sleeping is switched off', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);
    expect(body.sleeping).toBe(true);

    world.config.allowSleeping = false;
    updatePhysics3DSleep(world, 0);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
  });

  it('builds the island graph even when sleeping is switched off', () => {
    // Returning early without the union-find would split every awake body into a singleton, and a
    // two-body constraint would then be assigned to only one of those artificial components.
    const world = createPhysics3DWorld();
    const a = createBox(world);
    const b = createBox(world);
    world.contacts.push(createContact(a.index, b.index));
    world.config.allowSleeping = false;
    updatePhysics3DSleep(world, 0);
    buildPhysics3DSolveIslands(world);

    expect(world.solveIslandRoots).toHaveLength(1);
    expect(world.solveIslandBodyCounts).toEqual([2]);
  });

  it('never sleeps a body whose sleepEnabled is false', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    body.sleepEnabled = false;
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(body.sleeping).toBe(false);
  });

  it('makes a woken island earn its rest from zero', () => {
    const world = createPhysics3DWorld();
    const body = createBox(world);
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);
    expect(body.sleeping).toBe(true);

    body.velocityX = 10;
    updatePhysics3DSleep(world, 0.001);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
  });

  it('leaves static bodies neither awake nor asleep', () => {
    const world = createPhysics3DWorld();
    const ground = createBox(world);
    setPhysics3DBodyType(ground, 'static');
    updatePhysics3DSleep(world, world.config.timeToSleep + 1);

    expect(ground.sleeping).toBe(false);
  });
});

function createBox(world: Physics3DWorld): RigidBody3D {
  const body = createRigidBody3D();
  const mass = createPhysics3DMassData();
  computePhysics3DBoxMassData(0.5, 0.5, 0.5, 1, mass);
  setRigidBody3DMassData(body, mass);
  refreshRigidBody3DWorldInertia(body);
  addPhysics3DBody(world, body);
  return body;
}

function createContact(bodyA: number, bodyB: number): Physics3DContact {
  return {
    bodyA,
    bodyB,
    colliderA: 0,
    colliderB: 0,
    enabled: true,
    friction: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    pointCount: 1,
    points: [
      {
        depth: 0.01,
        featureId: 1,
        rAX: 0,
        rAY: -0.5,
        rAZ: 0,
        rBX: 0,
        rBY: 0.5,
        rBZ: 0,
        x: 0,
        y: 0,
        z: 0,
      },
    ],
    restitution: 0,
    sensor: false,
    touching: true,
  };
}
