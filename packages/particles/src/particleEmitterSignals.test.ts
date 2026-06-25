import { createParticleEmitter } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import {
  createParticleEmitterSignals,
  enableParticleEmitterSignals,
  getParticleEmitterSignals,
} from './particleEmitterSignals';
import { createParticleEmitterState } from './particleEmitterState';
import { updateParticleEmitter } from './updateParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as unknown as TextureAtlas;
}

function spawnOne(configOverrides: Record<string, unknown> = {}) {
  const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
  const state = createParticleEmitterState();
  const config = createParticleEmitterConfig({
    spawnRate: 1,
    lifetimeMin: 1,
    lifetimeMax: 1,
    speedMin: 0,
    speedMax: 0,
    ...configOverrides,
  });
  return { emitter, state, config };
}

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

describe('onEmitterComplete signal', () => {
  it('fires once when a finite non-looping emitter completes', () => {
    const { emitter, state } = spawnOne({ duration: 0.5, loop: false });
    const config = createParticleEmitterConfig({
      duration: 0.5,
      loop: false,
      spawnRate: 1,
      lifetimeMin: 0.1,
      lifetimeMax: 0.1,
      speedMin: 0,
      speedMax: 0,
    });
    const signals = enableParticleEmitterSignals(state);
    const completes: number[] = [];
    signals.onEmitterComplete.emit = () => completes.push(1);
    updateParticleEmitter(emitter, state, config, 1); // spawn + age past duration
    updateParticleEmitter(emitter, state, config, 1); // particles die → complete
    expect(completes.length).toBeGreaterThan(0);
  });

  it('does not fire for infinite emitters', () => {
    const { emitter, state, config } = spawnOne({ duration: 0, loop: true });
    const signals = enableParticleEmitterSignals(state);
    const completes: number[] = [];
    signals.onEmitterComplete.emit = () => completes.push(1);
    for (let i = 0; i < 10; i++) updateParticleEmitter(emitter, state, config, 1);
    expect(completes.length).toBe(0);
  });
});

describe('onParticleDeath signal', () => {
  it('fires with the particle position when a particle dies', () => {
    const { emitter, state, config } = spawnOne();
    const signals = enableParticleEmitterSignals(state);
    const deaths: Array<[number, number]> = [];
    signals.onParticleDeath.emit = (x: number, y: number) => deaths.push([x, y]);
    updateParticleEmitter(emitter, state, config, 1); // spawn
    updateParticleEmitter(emitter, state, config, 1.1); // age past lifetime → death
    expect(deaths.length).toBe(1);
    expect(Number.isFinite(deaths[0][0])).toBe(true);
  });
});

describe('onParticleSpawn signal', () => {
  it('fires with spawn position and velocity when a particle is spawned', () => {
    const { emitter, state, config } = spawnOne({ speedMin: 50, speedMax: 50 });
    const signals = enableParticleEmitterSignals(state);
    const spawns: Array<[number, number, number, number]> = [];
    signals.onParticleSpawn.emit = (x: number, y: number, vx: number, vy: number) => spawns.push([x, y, vx, vy]);
    updateParticleEmitter(emitter, state, config, 1);
    expect(spawns.length).toBe(1);
    const [, , vx, vy] = spawns[0];
    // Speed must match config (allow sign variations by checking magnitude).
    expect(Math.sqrt(vx * vx + vy * vy)).toBeCloseTo(50, 0);
  });
});
