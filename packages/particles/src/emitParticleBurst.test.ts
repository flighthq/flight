import { createParticleEmitter } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types';

import { emitParticleBurst } from './emitParticleBurst';
import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState } from './particleEmitterState';
import { createSeededRandom } from './random';
import { updateParticleEmitter } from './updateParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

describe('emitParticleBurst', () => {
  it('spawns the requested count at the given point', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ speedMin: 0, speedMax: 0, lifetimeMin: 10, lifetimeMax: 10 });
    const n = emitParticleBurst(emitter, state, config, 8, 200, 300);
    expect(n).toBe(8);
    expect(emitter.data.particleCount).toBe(8);
    // With zero speed and a point emitter, every particle sits at the burst point.
    for (let i = 0; i < 8; i++) {
      expect(emitter.data.transforms[i * 4]).toBeCloseTo(200);
      expect(emitter.data.transforms[i * 4 + 1]).toBeCloseTo(300);
    }
  });

  it('respects maxParticles and returns the actual spawn count', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ maxParticles: 5, lifetimeMin: 10, lifetimeMax: 10 });
    expect(emitParticleBurst(emitter, state, config, 100, 0, 0)).toBe(5);
    expect(emitter.data.particleCount).toBe(5);
  });

  it('adds to existing particles rather than replacing them', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ maxParticles: 100, lifetimeMin: 10, lifetimeMax: 10 });
    emitParticleBurst(emitter, state, config, 3, 0, 0);
    emitParticleBurst(emitter, state, config, 4, 0, 0);
    expect(emitter.data.particleCount).toBe(7);
  });

  it("does not touch the emitter's continuous-emission bookkeeping", () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ lifetimeMin: 10, lifetimeMax: 10 });
    emitParticleBurst(emitter, state, config, 3, 0, 0);
    expect(state.spawnAccumulator).toBe(0);
    expect(state.emitterAge).toBe(0);
  });

  it('is deterministic with a seeded state', () => {
    const run = (): number[] => {
      const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
      const state = createParticleEmitterState(createSeededRandom(99));
      const config = createParticleEmitterConfig({
        speedMin: 10,
        speedMax: 200,
        spread: Math.PI,
        lifetimeMin: 1,
        lifetimeMax: 5,
      });
      emitParticleBurst(emitter, state, config, 10, 0, 0);
      return Array.from(state.velocities.slice(0, 20));
    };
    expect(run()).toEqual(run());
  });

  it('composes into a death sub-emitter via onDeath (explosion on expiry)', () => {
    // Parent: short-lived particles. Child: a burst spawned where each parent dies.
    const parent = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const parentState = createParticleEmitterState();
    const parentConfig = createParticleEmitterConfig({
      spawnRate: 5,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
      speedMin: 0,
      speedMax: 0,
    });

    const child = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const childState = createParticleEmitterState();
    const childConfig = createParticleEmitterConfig({ maxParticles: 1000, lifetimeMin: 10, lifetimeMax: 10 });

    let deaths = 0;
    const onDeath = (x: number, y: number): void => {
      deaths++;
      emitParticleBurst(child, childState, childConfig, 6, x, y);
    };

    // Run long enough for the parent particles to spawn and then expire.
    for (let i = 0; i < 30; i++) updateParticleEmitter(parent, parentState, parentConfig, 1 / 30, { onDeath });

    expect(deaths).toBeGreaterThan(0);
    expect(child.data.particleCount).toBe(deaths * 6); // 6 child particles per parent death
  });
});
