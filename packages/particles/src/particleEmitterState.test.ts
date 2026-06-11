import { createParticleEmitterState } from './particleEmitterState';

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
