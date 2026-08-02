import { describe, expect, it } from 'vitest';

import { explainPhysics2DJoints } from './explainPhysics2DJoints';
import { createPhysics2DDistanceJoint } from './jointFactories';
import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import { addPhysics2DBody, createPhysics2DWorld, createRigidBody2D } from './world';

const NOOP_SOLVER = { prepare: () => {}, solve: () => {} };

describe('explainPhysics2DJoints', () => {
  it('reports a fully resolvable world as complete', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Distance', NOOP_SOLVER);
    const first = addPhysics2DBody(world, createRigidBody2D('dynamic', 0, 0));
    const second = addPhysics2DBody(world, createRigidBody2D('dynamic', 1, 0));
    addPhysics2DJoint(world, createPhysics2DDistanceJoint({ bodyA: first.index, bodyB: second.index, length: 1 }));

    expect(explainPhysics2DJoints(world)).toEqual({
      joints: [
        {
          bodyA: first.index,
          bodyAFound: true,
          bodyAUsed: true,
          bodyB: second.index,
          bodyBFound: true,
          jointIndex: 0,
          kind: 'Distance',
          solverRegistered: true,
          status: 'ready',
        },
      ],
      readyCount: 1,
      status: 'complete',
    });
  });

  it('makes an unregistered kind and every missing endpoint observable', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, createRigidBody2D('dynamic', 0, 0));
    addPhysics2DJoint(world, {
      ...createPhysics2DDistanceJoint({ bodyA: body.index, bodyB: 99, length: 1 }),
      kind: 'acme.Unknown',
    });
    registerPhysics2DJointSolver(world, 'MissingA', NOOP_SOLVER);
    registerPhysics2DJointSolver(world, 'MissingB', NOOP_SOLVER);
    registerPhysics2DJointSolver(world, 'MissingBoth', NOOP_SOLVER);
    addPhysics2DJoint(world, {
      ...createPhysics2DDistanceJoint({ bodyA: 98, bodyB: body.index, length: 1 }),
      kind: 'MissingA',
    });
    addPhysics2DJoint(world, {
      ...createPhysics2DDistanceJoint({ bodyA: body.index, bodyB: 99, length: 1 }),
      kind: 'MissingB',
    });
    addPhysics2DJoint(world, {
      ...createPhysics2DDistanceJoint({ bodyA: 98, bodyB: 99, length: 1 }),
      kind: 'MissingBoth',
    });

    const explanation = explainPhysics2DJoints(world);

    expect(explanation.status).toBe('unresolved-joints');
    expect(explanation.readyCount).toBe(0);
    expect(explanation.joints.map((joint) => joint.status)).toEqual([
      'solver-unregistered',
      'body-a-missing',
      'body-b-missing',
      'bodies-missing',
    ]);
    expect(explanation.joints[0]).toMatchObject({ bodyAFound: true, bodyBFound: false, solverRegistered: false });
  });

  it('reports an unused missing bodyA as ready', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, createRigidBody2D('dynamic', 0, 0));
    registerPhysics2DJointSolver(world, 'OneBody', { prepare: () => {}, solve: () => {}, usesBodyA: false });
    addPhysics2DJoint(world, {
      ...createPhysics2DDistanceJoint({ bodyA: 999, bodyB: body.index, length: 1 }),
      kind: 'OneBody',
    });

    const explanation = explainPhysics2DJoints(world);

    expect(explanation.joints[0]).toMatchObject({ bodyAFound: false, bodyAUsed: false, status: 'ready' });
    expect(explanation.status).toBe('complete');
  });

  it('recomputes current state without retaining earlier failures', () => {
    const world = createPhysics2DWorld();
    const first = addPhysics2DBody(world, createRigidBody2D('dynamic', 0, 0));
    const second = addPhysics2DBody(world, createRigidBody2D('dynamic', 1, 0));
    addPhysics2DJoint(world, {
      ...createPhysics2DDistanceJoint({ bodyA: first.index, bodyB: second.index, length: 1 }),
      kind: 'acme.Deferred',
    });
    const before = explainPhysics2DJoints(world);

    registerPhysics2DJointSolver(world, 'acme.Deferred', NOOP_SOLVER);
    const after = explainPhysics2DJoints(world);

    expect(before.joints[0].status).toBe('solver-unregistered');
    expect(after.joints[0].status).toBe('ready');
    expect(after.status).toBe('complete');
  });
});
