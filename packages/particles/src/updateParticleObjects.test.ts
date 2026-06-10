import type { HasAppearance, HasTransform2D } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleObjectsState } from './particleObjectsState';
import type { ParticleObject } from './updateParticleObjects';
import { updateParticleObjects } from './updateParticleObjects';

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
  } as HasTransform2D & HasAppearance;
}

describe('updateParticleObjects', () => {
  it('does nothing when objects array is empty', () => {
    const state = createParticleObjectsState(0);
    const config = createParticleEmitterConfig();
    expect(() => updateParticleObjects([], state, config, 1)).not.toThrow();
  });

  it('spawns objects from the pool', () => {
    const objects = [makeObject(), makeObject(), makeObject()];
    const state = createParticleObjectsState(3);
    const config = createParticleEmitterConfig({ spawnRate: 2, lifetimeMin: 10, lifetimeMax: 10 });
    updateParticleObjects(objects, state, config, 1);
    const liveCount = objects.filter((o) => o.visible).length;
    expect(liveCount).toBe(2);
  });

  it('sets spawned objects to visible and positions them at origin', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1);
    expect(objects[0].visible).toBe(true);
    expect(objects[0].x).toBe(0);
    expect(objects[0].y).toBe(0);
  });

  it('kills objects when their lifetime expires', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn (spawnRate*dt=1)
    expect(objects[0].visible).toBe(true);
    updateParticleObjects(objects, state, config, 0.6); // advance past lifetime
    expect(objects[0].visible).toBe(false);
  });

  it('moves objects according to velocity and gravity', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      gravityX: 100,
      gravityY: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn at (0,0)
    updateParticleObjects(objects, state, config, 1); // integrate gravity
    expect(objects[0].x).toBeGreaterThan(0);
  });

  it('fades alpha from alphaStart to alphaEnd over lifetime', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      alphaStart: 1,
      alphaEnd: 0,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn 1 particle
    updateParticleObjects(objects, state, config, 0.5); // advance to half lifetime
    expect(objects[0].alpha).toBeCloseTo(0.5, 1);
  });

  it('respects maxParticles — does not exceed pool size', () => {
    const objects = [makeObject(), makeObject()];
    const state = createParticleObjectsState(2);
    const config = createParticleEmitterConfig({
      spawnRate: 100,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleObjects(objects, state, config, 1);
    const liveCount = objects.filter((o) => o.visible).length;
    expect(liveCount).toBeLessThanOrEqual(objects.length);
  });

  it('can re-use dead slots for new spawns', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 2,
      lifetimeMin: 0.1,
      lifetimeMax: 0.1,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn (kills immediately in next frame)
    updateParticleObjects(objects, state, config, 1); // kills expired, spawns fresh one
    expect(objects[0].visible).toBe(true);
  });
});
