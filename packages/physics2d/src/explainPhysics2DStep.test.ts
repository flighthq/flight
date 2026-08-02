import { describe, expect, it } from 'vitest';

import { explainPhysics2DStep } from './explainPhysics2DStep';
import { createPhysics2DWorld, createRigidBody2D } from './world';

describe('explainPhysics2DStep', () => {
  it('reports a valid step as ready', () => {
    expect(explainPhysics2DStep(createPhysics2DWorld(), 1 / 60)).toEqual({
      bodyStateValid: true,
      contactStateValid: true,
      gravityValid: true,
      jointStateValid: true,
      positionIterationsValid: true,
      previousTimestepValid: true,
      solverConfigValid: true,
      status: 'ready',
      timestepValid: true,
      velocityIterationsValid: true,
    });
  });

  it('keeps simultaneous timestep and iteration faults visible', () => {
    const world = createPhysics2DWorld();
    world.config.velocityIterations = Infinity;
    world.config.positionIterations = 1.5;

    expect(explainPhysics2DStep(world, Number.NaN)).toEqual({
      bodyStateValid: true,
      contactStateValid: true,
      gravityValid: true,
      jointStateValid: true,
      positionIterationsValid: false,
      previousTimestepValid: true,
      solverConfigValid: true,
      status: 'invalid-step',
      timestepValid: false,
      velocityIterationsValid: false,
    });
  });

  it('reports simultaneous world, configuration, body, contact, and joint state faults', () => {
    const world = createPhysics2DWorld();
    world.gravityX = Number.NaN;
    world.previousTimestep = -1;
    world.config.positionCorrection = Number.NaN;
    const made = createRigidBody2D('dynamic', Number.NaN, 0);
    made.index = 0;
    world.bodies.push(made);
    world.bodyByIndex.set(0, made);
    world.contacts.push({ normalX: Number.NaN, pointCount: 0, points: [] } as never);
    world.joints.push({ bodyA: 0, bodyB: 0, collideConnected: false, impulse0: Number.NaN, kind: 'Test' } as never);

    expect(explainPhysics2DStep(world, 1 / 60)).toMatchObject({
      bodyStateValid: false,
      contactStateValid: false,
      gravityValid: false,
      jointStateValid: false,
      previousTimestepValid: false,
      solverConfigValid: false,
      status: 'invalid-step',
    });
  });
});
