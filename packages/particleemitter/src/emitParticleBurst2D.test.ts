import { createRandomSource } from '@flighthq/math';
import { createParticleEmitterConfig, createParticleEmitterState } from '@flighthq/particles';
import type { TextureAtlas } from '@flighthq/types';

import { emitParticleBurst2D } from './emitParticleBurst2D';
import { createParticleEmitter2D } from './particleEmitter';
import { updateParticleEmitter2D } from './updateParticleEmitter2D';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

describe('emitParticleBurst2D', () => {
  it('spawns the requested count at the given point', () => {
    const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ speedMin: 0, speedMax: 0, lifetimeMin: 10, lifetimeMax: 10 });
    const n = emitParticleBurst2D(emitter, state, config, 8, 200, 300);
    expect(n).toBe(8);
    expect(emitter.data.particleCount).toBe(8);
    // With zero speed and a point emitter, every particle sits at the burst point.
    for (let i = 0; i < 8; i++) {
      expect(emitter.data.transforms[i * 4]).toBeCloseTo(200);
      expect(emitter.data.transforms[i * 4 + 1]).toBeCloseTo(300);
    }
  });

  it('respects maxParticles and returns the actual spawn count', () => {
    const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ maxParticles: 5, lifetimeMin: 10, lifetimeMax: 10 });
    expect(emitParticleBurst2D(emitter, state, config, 100, 0, 0)).toBe(5);
    expect(emitter.data.particleCount).toBe(5);
  });

  it('adds to existing particles rather than replacing them', () => {
    const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ maxParticles: 100, lifetimeMin: 10, lifetimeMax: 10 });
    emitParticleBurst2D(emitter, state, config, 3, 0, 0);
    emitParticleBurst2D(emitter, state, config, 4, 0, 0);
    expect(emitter.data.particleCount).toBe(7);
  });

  it("does not touch the emitter's continuous-emission bookkeeping", () => {
    const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ lifetimeMin: 10, lifetimeMax: 10 });
    emitParticleBurst2D(emitter, state, config, 3, 0, 0);
    expect(state.spawnAccumulator).toBe(0);
    expect(state.emitterAge).toBe(0);
  });

  it('is deterministic with a seeded state', () => {
    const run = (): number[] => {
      const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
      const state = createParticleEmitterState(createRandomSource(99));
      const config = createParticleEmitterConfig({
        speedMin: 10,
        speedMax: 200,
        spread: Math.PI,
        lifetimeMin: 1,
        lifetimeMax: 5,
      });
      emitParticleBurst2D(emitter, state, config, 10, 0, 0);
      return Array.from(state.velocities.slice(0, 20));
    };
    expect(run()).toEqual(run());
  });

  it('modulates spawn color and alpha by a packed tint', () => {
    const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    // Default config color is white, so a tint alone sets the per-particle color.
    const config = createParticleEmitterConfig({ lifetimeMin: 10, lifetimeMax: 10, alphaStart: 1 });
    emitParticleBurst2D(emitter, state, config, 2, 0, 0, 0x8040c0ff);
    for (let i = 0; i < 2; i++) {
      expect(emitter.data.colors[i * 3]).toBeCloseTo(0x80 / 255);
      expect(emitter.data.colors[i * 3 + 1]).toBeCloseTo(0x40 / 255);
      expect(emitter.data.colors[i * 3 + 2]).toBeCloseTo(0xc0 / 255);
      expect(emitter.data.alphas[i]).toBeCloseTo(1);
    }
  });

  it('multiplies a non-white config color by the tint (composes, not replaces)', () => {
    const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      lifetimeMin: 10,
      lifetimeMax: 10,
      colorStartR: 0.5,
      colorStartG: 1,
      colorStartB: 0.25,
      alphaStart: 1,
    });
    // Tint 0xffffff80: white RGB (no color change) with half alpha.
    emitParticleBurst2D(emitter, state, config, 1, 0, 0, 0xffffff80);
    expect(emitter.data.colors[0]).toBeCloseTo(0.5);
    expect(emitter.data.colors[1]).toBeCloseTo(1);
    expect(emitter.data.colors[2]).toBeCloseTo(0.25);
    expect(emitter.data.alphas[0]).toBeCloseTo(0x80 / 255);
  });

  it('leaves color untinted when no tint is passed', () => {
    const emitter = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ lifetimeMin: 10, lifetimeMax: 10 });
    emitParticleBurst2D(emitter, state, config, 1, 0, 0);
    expect(emitter.data.colors[0]).toBeCloseTo(1);
    expect(emitter.data.colors[1]).toBeCloseTo(1);
    expect(emitter.data.colors[2]).toBeCloseTo(1);
  });

  it('composes into a death sub-emitter via onDeath (explosion on expiry)', () => {
    // Parent: short-lived particles. Child: a burst spawned where each parent dies.
    const parent = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const parentState = createParticleEmitterState();
    const parentConfig = createParticleEmitterConfig({
      spawnRate: 5,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
      speedMin: 0,
      speedMax: 0,
    });

    const child = createParticleEmitter2D({ data: { atlas: makeAtlas() } });
    const childState = createParticleEmitterState();
    const childConfig = createParticleEmitterConfig({ maxParticles: 1000, lifetimeMin: 10, lifetimeMax: 10 });

    let deaths = 0;
    const onDeath = (x: number, y: number): void => {
      deaths++;
      emitParticleBurst2D(child, childState, childConfig, 6, x, y);
    };

    // Run long enough for the parent particles to spawn and then expire.
    for (let i = 0; i < 30; i++) updateParticleEmitter2D(parent, parentState, parentConfig, 1 / 30, { onDeath });

    expect(deaths).toBeGreaterThan(0);
    expect(child.data.particleCount).toBe(deaths * 6); // 6 child particles per parent death
  });
});
