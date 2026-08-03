import { describe, expect, it } from 'vitest';

import { assertPhysics2DBodyNotStepping, assertPhysics2DWorldNotStepping, steppingPhysics2DWorlds } from './ownership';
import { addPhysics2DBody, createPhysics2DWorld, createRigidBody2D } from './world';

describe('assertPhysics2DBodyNotStepping', () => {
  it('resolves an owned body to its active world while leaving detached authoring data available', () => {
    const world = createPhysics2DWorld();
    const owned = addPhysics2DBody(world, createRigidBody2D('dynamic', 0, 0));
    const detached = createRigidBody2D('dynamic', 0, 0);
    steppingPhysics2DWorlds.add(world);
    try {
      expect(() => assertPhysics2DBodyNotStepping(owned)).toThrow(/while it is stepping/);
      expect(() => assertPhysics2DBodyNotStepping(detached)).not.toThrow();
    } finally {
      steppingPhysics2DWorlds.delete(world);
    }
  });
});

describe('assertPhysics2DWorldNotStepping', () => {
  it('rejects an active world and accepts it again after the step boundary is released', () => {
    const world = createPhysics2DWorld();
    expect(() => assertPhysics2DWorldNotStepping(world)).not.toThrow();

    steppingPhysics2DWorlds.add(world);
    try {
      expect(() => assertPhysics2DWorldNotStepping(world)).toThrow(/while it is stepping/);
    } finally {
      steppingPhysics2DWorlds.delete(world);
    }

    expect(() => assertPhysics2DWorldNotStepping(world)).not.toThrow();
  });
});
