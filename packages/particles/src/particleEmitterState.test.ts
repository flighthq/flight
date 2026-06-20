import { createRandomSource } from '@flighthq/math';
import { createParticleEmitter } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState, ensureParticleEmitterStateCapacity } from './particleEmitterState';
import { updateParticleEmitter } from './updateParticleEmitter';

// Runs a short emitter simulation seeded from `seed` and returns the live particle transforms, so a
// seeded state can be shown to simulate reproducibly (the seeded RNG now lives in @flighthq/math).
function simulate(seed: number): number[] {
  const emitter = createParticleEmitter({
    data: {
      atlas: {
        image: null,
        regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
      } as TextureAtlas,
    },
  });
  const state = createParticleEmitterState(createRandomSource(seed));
  const config = createParticleEmitterConfig({
    spawnRate: 20,
    maxParticles: 100,
    lifetimeMin: 0.5,
    lifetimeMax: 1.5,
    speedMin: 10,
    speedMax: 200,
    spread: Math.PI,
    emitterShape: 'circle',
    emitterRadius: 25,
    colorStartVarianceR: 0.5,
  });
  for (let f = 0; f < 30; f++) updateParticleEmitter(emitter, state, config, 1 / 60);
  return Array.from(emitter.data.transforms.slice(0, emitter.data.particleCount * 4));
}

describe('createParticleEmitterState', () => {
  it('seeded identically, two states simulate bit-for-bit identically', () => {
    expect(simulate(42)).toEqual(simulate(42));
  });

  it('diverges under different seeds', () => {
    expect(simulate(42)).not.toEqual(simulate(43));
  });

  it('returns empty arrays, zero accumulator, burstTimer=0, and NaN prev position', () => {
    const state = createParticleEmitterState();
    expect(state.lifetimes).toBeInstanceOf(Float32Array);
    expect(state.lifetimes.length).toBe(0);
    expect(state.velocities).toBeInstanceOf(Float32Array);
    expect(state.velocities.length).toBe(0);
    expect(state.scales).toBeInstanceOf(Float32Array);
    expect(state.scales.length).toBe(0);
    expect(state.rotationSpeeds).toBeInstanceOf(Float32Array);
    expect(state.rotationSpeeds.length).toBe(0);
    expect(state.colorBirth).toBeInstanceOf(Float32Array);
    expect(state.colorDeath).toBeInstanceOf(Float32Array);
    expect(state.spawnAccumulator).toBe(0);
    expect(state.burstTimer).toBe(0);
    expect(isNaN(state.prevX)).toBe(true);
    expect(isNaN(state.prevY)).toBe(true);
  });

  it('returns a new object each call', () => {
    const a = createParticleEmitterState();
    const b = createParticleEmitterState();
    expect(a).not.toBe(b);
  });
});

describe('ensureParticleEmitterStateCapacity', () => {
  it('grows the per-particle arrays to hold at least `capacity` particles', () => {
    const state = createParticleEmitterState();
    ensureParticleEmitterStateCapacity(state, 10, false);
    expect(state.lifetimes.length).toBeGreaterThanOrEqual(10 * 2);
    expect(state.velocities.length).toBeGreaterThanOrEqual(10 * 2);
    expect(state.scales.length).toBeGreaterThanOrEqual(10);
    expect(state.rotationSpeeds.length).toBeGreaterThanOrEqual(10);
  });

  it('leaves the color arrays empty when the emitter has no color variance', () => {
    const state = createParticleEmitterState();
    ensureParticleEmitterStateCapacity(state, 8, false);
    expect(state.colorBirth.length).toBe(0);
    expect(state.colorDeath.length).toBe(0);
  });

  it('grows the color arrays only when color variance is requested', () => {
    const state = createParticleEmitterState();
    ensureParticleEmitterStateCapacity(state, 8, true);
    expect(state.colorBirth.length).toBeGreaterThanOrEqual(8 * 3);
    expect(state.colorDeath.length).toBeGreaterThanOrEqual(8 * 3);
  });

  it('is a no-op when already large enough', () => {
    const state = createParticleEmitterState();
    ensureParticleEmitterStateCapacity(state, 16, false);
    const lifetimes = state.lifetimes;
    const velocities = state.velocities;
    ensureParticleEmitterStateCapacity(state, 4, false); // smaller request → no reallocation
    expect(state.lifetimes).toBe(lifetimes);
    expect(state.velocities).toBe(velocities);
  });

  it('back-fills color arrays for an already-sized state when variance turns on', () => {
    const state = createParticleEmitterState();
    ensureParticleEmitterStateCapacity(state, 8, false); // sized, no color
    expect(state.colorBirth.length).toBe(0);
    ensureParticleEmitterStateCapacity(state, 8, true); // same capacity, now wants color
    expect(state.colorBirth.length).toBeGreaterThanOrEqual(8 * 3);
    expect(state.colorDeath.length).toBeGreaterThanOrEqual(8 * 3);
  });
});
