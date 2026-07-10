import { createParticleEmitterConfig, createParticleEmitterState } from '@flighthq/particles';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitter } from './particleEmitter';
import { prewarmParticleEmitter } from './prewarmParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

describe('prewarmParticleEmitter', () => {
  it('produces live particles after warming for one lifetime', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 20, lifetimeMin: 1, lifetimeMax: 1 });
    prewarmParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
  });

  it('does not exceed maxParticles', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 1000, maxParticles: 10, lifetimeMin: 10, lifetimeMax: 10 });
    prewarmParticleEmitter(emitter, state, config, 5);
    expect(emitter.data.particleCount).toBeLessThanOrEqual(10);
  });

  it('accepts a custom stepDeltaTime and still produces particles', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, lifetimeMin: 5, lifetimeMax: 5 });
    prewarmParticleEmitter(emitter, state, config, 1, 1 / 30);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
  });

  it('fires onSpawn callback during warm-up', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 5, lifetimeMin: 10, lifetimeMax: 10 });
    let spawned = 0;
    prewarmParticleEmitter(emitter, state, config, 1, 1 / 60, {
      onSpawn: () => {
        spawned++;
      },
    });
    expect(spawned).toBeGreaterThan(0);
  });

  it('leaves emitter unmodified when duration is zero', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 100, lifetimeMin: 1, lifetimeMax: 1 });
    prewarmParticleEmitter(emitter, state, config, 0);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('does not hang when stepDeltaTime is zero (falls back to a single step)', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, lifetimeMin: 10, lifetimeMax: 10 });
    prewarmParticleEmitter(emitter, state, config, 1, 0);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
  });
});
