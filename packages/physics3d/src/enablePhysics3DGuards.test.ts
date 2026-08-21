import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry, Physics3DWorld } from '@flighthq/types/contract';

import { arePhysics3DGuardsEnabled, disablePhysics3DGuards, enablePhysics3DGuards } from './enablePhysics3DGuards';
import { createPhysics3DHingeJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import { stepPhysics3D } from './step';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

afterEach(() => {
  disablePhysics3DGuards();
});

describe('arePhysics3DGuardsEnabled', () => {
  it('reports the current module guard state', () => {
    expect(arePhysics3DGuardsEnabled()).toBe(false);
    enablePhysics3DGuards();
    expect(arePhysics3DGuardsEnabled()).toBe(true);
  });
});

describe('disablePhysics3DGuards', () => {
  it('removes the seam so a declined step is silent again', () => {
    enablePhysics3DGuards();
    disablePhysics3DGuards();
    const world = createTestWorld();
    world.config.sequentialImpulse.positionIterations = -3;

    const entries = captureLog(() => stepPhysics3D(world, 1 / 60));

    expect(entries).toHaveLength(0);
  });

  it('removes the unresolved-joint seam', () => {
    enablePhysics3DGuards();
    disablePhysics3DGuards();
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));

    const entries = captureLog(() => stepPhysics3D(world, 1 / 60));

    expect(entries).toHaveLength(0);
  });
});

describe('enablePhysics3DGuards', () => {
  it('says nothing while the world steps normally', () => {
    enablePhysics3DGuards();

    const entries = captureLog(() => stepPhysics3D(createTestWorld(), 1 / 60));

    // A guard that fired on a healthy step would be worse than none: the message is supposed to mean the
    // simulation has stopped advancing.
    expect(entries).toHaveLength(0);
  });

  it('names every failing precondition at once, not only the first', () => {
    enablePhysics3DGuards();
    const world = createTestWorld();
    world.gravityY = Number.NaN;
    world.config.substeps = 0;

    const entries = captureLog(() => stepPhysics3D(world, 0));

    expect(entries).toHaveLength(1);
    const failing = readFailing(entries[0]);
    // The step's own condition short-circuits, so one fault per frame would make a caller repair a
    // three-fault world across three frames, each fix revealing the next.
    expect([...failing].sort()).toEqual(['gravityValid', 'substepsValid', 'timestepValid']);
  });

  it('logs once for a repeating fault and again when a different one joins it', () => {
    enablePhysics3DGuards();
    const world = createTestWorld();
    world.config.sequentialImpulse.velocityIterations = -1;

    const repeated = captureLog(() => {
      for (let frame = 0; frame < 5; frame += 1) stepPhysics3D(world, 1 / 60);
    });
    expect(repeated).toHaveLength(1);

    // Keyed on the failing SET rather than on the world, so a frame loop costs one message while a world
    // that develops a SECOND fault still reports it instead of being swallowed by the first key.
    const widened = captureLog(() => {
      world.gravityZ = Number.NaN;
      stepPhysics3D(world, 1 / 60);
    });
    expect(widened).toHaveLength(1);
    expect(readFailing(widened[0])).toContain('gravityValid');
  });

  it('names every joint the solve skips and distinguishes why', () => {
    enablePhysics3DGuards();
    const world = createTestWorld();
    const unregistered = createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 });
    unregistered.kind = 'guard.unregistered';
    addPhysics3DJoint(world, unregistered);
    registerBuiltInPhysics3DJointSolvers(world);
    const invalidBodies = addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));
    invalidBodies.bodyB = 99;

    const entries = captureLog(() => {
      stepPhysics3D(world, 1 / 60);
      stepPhysics3D(world, 1 / 60);
    });

    expect(entries).toHaveLength(1);
    expect(readJointIssues(entries[0])).toEqual([
      { index: 0, kind: 'guard.unregistered', status: 'unregistered-kind' },
      { index: 1, kind: 'Hinge', status: 'invalid-bodies' },
    ]);
  });
});

// `LogData` is deliberately `string | Record<string, unknown>`, so a structured entry's fields are only
// reachable through a narrowing read rather than a property access.
function readFailing(entry: Readonly<LogEntry>): readonly string[] {
  const data = entry.data;
  if (typeof data === 'string' || data === undefined) return [];
  return (data.failing as readonly string[] | undefined) ?? [];
}

function readJointIssues(entry: Readonly<LogEntry>): readonly Record<string, unknown>[] {
  const data = entry.data;
  if (typeof data === 'string' || data === undefined) return [];
  return (data.joints as readonly Record<string, unknown>[] | undefined) ?? [];
}

// Steppable as built: every fault in these tests is one the test introduces, so a case that expects
// silence is asserting the guard's judgement rather than a world that happens to be fine.
function createTestWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  return world;
}
