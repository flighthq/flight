import { createParticleEmitterState } from './particleEmitterState';

describe('createParticleEmitterState', () => {
  it('returns empty arrays and zero accumulator', () => {
    const state = createParticleEmitterState();
    expect(state.lifetimes).toBeInstanceOf(Float32Array);
    expect(state.lifetimes.length).toBe(0);
    expect(state.velocities).toBeInstanceOf(Float32Array);
    expect(state.velocities.length).toBe(0);
    expect(state.spawnAccumulator).toBe(0);
  });

  it('returns a new object each call', () => {
    const a = createParticleEmitterState();
    const b = createParticleEmitterState();
    expect(a).not.toBe(b);
  });
});
