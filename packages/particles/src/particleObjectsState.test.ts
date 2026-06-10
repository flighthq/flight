import { createParticleObjectsState, ensureParticleObjectsStateCapacity } from './particleObjectsState';

describe('createParticleObjectsState', () => {
  it('allocates arrays sized to capacity', () => {
    const state = createParticleObjectsState(10);
    expect(state.lifetimes.length).toBe(20);
    expect(state.velocities.length).toBe(20);
    expect(state.spawnAccumulator).toBe(0);
  });

  it('all lifetime slots start as dead (maxAge = 0)', () => {
    const state = createParticleObjectsState(5);
    for (let i = 0; i < 5; i++) {
      expect(state.lifetimes[i * 2 + 1]).toBe(0);
    }
  });
});

describe('ensureParticleObjectsStateCapacity', () => {
  it('does not reallocate when already large enough', () => {
    const state = createParticleObjectsState(10);
    const { lifetimes, velocities } = state;
    ensureParticleObjectsStateCapacity(state, 10);
    expect(state.lifetimes).toBe(lifetimes);
    expect(state.velocities).toBe(velocities);
  });

  it('grows arrays when capacity is insufficient', () => {
    const state = createParticleObjectsState(5);
    ensureParticleObjectsStateCapacity(state, 20);
    expect(state.lifetimes.length).toBeGreaterThanOrEqual(40);
    expect(state.velocities.length).toBeGreaterThanOrEqual(40);
  });
});
