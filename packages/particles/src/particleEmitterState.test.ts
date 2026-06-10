import { createParticleEmitterState } from './particleEmitterState';

describe('createParticleEmitterState', () => {
  it('returns empty arrays, zero accumulator, and burstTimer=0', () => {
    const state = createParticleEmitterState();
    expect(state.lifetimes).toBeInstanceOf(Float32Array);
    expect(state.lifetimes.length).toBe(0);
    expect(state.velocities).toBeInstanceOf(Float32Array);
    expect(state.velocities.length).toBe(0);
    expect(state.scales).toBeInstanceOf(Float32Array);
    expect(state.scales.length).toBe(0);
    expect(state.rotationSpeeds).toBeInstanceOf(Float32Array);
    expect(state.rotationSpeeds.length).toBe(0);
    expect(state.spawnAccumulator).toBe(0);
    expect(state.burstTimer).toBe(0);
  });

  it('returns a new object each call', () => {
    const a = createParticleEmitterState();
    const b = createParticleEmitterState();
    expect(a).not.toBe(b);
  });
});
