import {
  createParticleEmitterSignals,
  enableParticleEmitterSignals,
  getParticleEmitterSignals,
} from './particleEmitterSignals';
import { createParticleEmitterState } from './particleEmitterState';

describe('createParticleEmitterSignals', () => {
  it('creates a signals group with all three signal slots', () => {
    const signals = createParticleEmitterSignals();
    expect(signals.onParticleSpawn).toBeDefined();
    expect(signals.onParticleDeath).toBeDefined();
    expect(signals.onEmitterComplete).toBeDefined();
  });
});

describe('enableParticleEmitterSignals', () => {
  it('returns the same object on repeated calls', () => {
    const state = createParticleEmitterState();
    const a = enableParticleEmitterSignals(state);
    const b = enableParticleEmitterSignals(state);
    expect(a).toBe(b);
  });

  it('returns null from getParticleEmitterSignals before enablement', () => {
    const state = createParticleEmitterState();
    expect(getParticleEmitterSignals(state)).toBeNull();
  });

  it('returns non-null from getParticleEmitterSignals after enablement', () => {
    const state = createParticleEmitterState();
    enableParticleEmitterSignals(state);
    expect(getParticleEmitterSignals(state)).not.toBeNull();
  });
});

describe('getParticleEmitterSignals', () => {
  it('returns null when signals have not been enabled', () => {
    const state = createParticleEmitterState();
    expect(getParticleEmitterSignals(state)).toBeNull();
  });
});
