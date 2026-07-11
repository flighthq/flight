import type { ParticleObject } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleObjectsState } from './particleObjectsState';
import { stepParticleObjects } from './stepParticleObjects';

function makeObject(): ParticleObject {
  return {
    alpha: 1,
    blendMode: null,
    colorTransform: null,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: false,
    x: 0,
    y: 0,
  } as unknown as ParticleObject;
}

describe('stepParticleObjects', () => {
  it('spawns into dead slots when called with no forces or colliders', () => {
    const objects = Array.from({ length: 10 }, makeObject);
    const state = createParticleObjectsState(10);
    const config = createParticleEmitterConfig({ spawnRate: 5, lifetimeMin: 10, lifetimeMax: 10 });
    stepParticleObjects(objects, state, config, 1);
    const visible = objects.filter((o) => o.visible).length;
    expect(visible).toBe(5);
  });
});
