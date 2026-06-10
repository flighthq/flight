import { createParticleEmitter, reserveParticleEmitter } from '@flighthq/scene-sprite';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState } from './particleEmitterState';
import { updateParticleEmitter } from './updateParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

describe('updateParticleEmitter', () => {
  it('spawns particles up to spawnRate × dt', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, maxParticles: 100 });
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(10);
  });

  it('respects maxParticles limit', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 100, maxParticles: 5 });
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(5);
  });

  it('ages particles over time', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn 1 particle (spawnRate*dt=1)
    expect(emitter.data.particleCount).toBe(1);
    updateParticleEmitter(emitter, state, config, 0.1); // age by 0.1
    expect(state.lifetimes[0]).toBeCloseTo(0.1);
  });

  it('removes particles when lifetime expires', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
    });
    // Spawn one particle
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(1);
    // Advance past lifetime
    updateParticleEmitter(emitter, state, config, 0.6);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('integrates velocity with gravity', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      gravityX: 100,
      gravityY: 0,
      spread: 0,
      directionX: 0,
      directionY: -1,
    });
    updateParticleEmitter(emitter, state, config, 1);
    // After spawn, position is (0,0). After next update with gravity...
    updateParticleEmitter(emitter, state, config, 1);
    // vx = 100*1 = 100, x += 100*1 = 100 (gravity applied to velocity then integrated)
    const x = emitter.data.transforms[0];
    expect(x).toBeGreaterThan(0);
  });

  it('interpolates alpha from alphaStart to alphaEnd over lifetime', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      alphaStart: 1,
      alphaEnd: 0,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn 1 particle
    updateParticleEmitter(emitter, state, config, 0.5); // advance to half lifetime
    expect(emitter.data.alphas[0]).toBeCloseTo(0.5, 1);
  });

  it('accumulates fractional spawn debt across frames', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 10,
      lifetimeMin: 10,
      lifetimeMax: 10,
      maxParticles: 100,
    });
    // 10 frames of dt=0.05 → total dt=0.5 → 5 particles
    for (let i = 0; i < 10; i++) updateParticleEmitter(emitter, state, config, 0.05);
    expect(emitter.data.particleCount).toBe(5);
  });

  it('grows emitter arrays as needed', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 100,
      maxParticles: 50,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(50);
    expect(emitter.data.transforms.length).toBeGreaterThanOrEqual(50 * 4);
  });

  it('pre-reserved emitters do not allocate during update', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    reserveParticleEmitter(emitter, 100);
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, maxParticles: 100 });
    const { transforms } = emitter.data;
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.transforms).toBe(transforms);
  });
});
