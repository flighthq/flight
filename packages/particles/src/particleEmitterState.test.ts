import { createParticleEmitterState, ensureParticleEmitterStateCapacity } from './particleEmitterState';

describe('createParticleEmitterState', () => {
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
