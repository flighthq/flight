import { describe, expect, it } from 'vitest';

import { explainPhysics2DStep } from './explainPhysics2DStep';
import { createPhysics2DWorld } from './world';

describe('explainPhysics2DStep', () => {
  it('reports a valid step as ready', () => {
    expect(explainPhysics2DStep(createPhysics2DWorld(), 1 / 60)).toEqual({
      positionIterationsValid: true,
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
      positionIterationsValid: false,
      status: 'invalid-step',
      timestepValid: false,
      velocityIterationsValid: false,
    });
  });
});
