import { describe, expect, it } from 'vitest';

import { assertPhysics2DWorldNotStepping, steppingPhysics2DWorlds } from './ownership';
import { createPhysics2DWorld } from './world';

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
