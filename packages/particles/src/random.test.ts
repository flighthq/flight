import { createParticleEmitter } from '@flighthq/scene-sprite';
import type { TextureAtlas } from '@flighthq/types';

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

describe('createSeededRandom', () => {
  it('produces values in [0, 1)', () => {
    const rng = createSeededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic — same seed yields the same sequence', () => {
    const a = createSeededRandom(0xc0ffee);
    const b = createSeededRandom(0xc0ffee);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('different seeds yield different sequences', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    let differs = false;
    for (let i = 0; i < 10; i++) if (a() !== b()) differs = true;
    expect(differs).toBe(true);
  });

  it('tolerates non-finite seeds without producing NaN', () => {
    const rng = createSeededRandom(NaN);
    const v = rng();
    expect(Number.isFinite(v)).toBe(true);
  });
});

describe('deterministic particle simulation', () => {
  function simulate(seed: number): number[] {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState(createSeededRandom(seed));
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

  it('two emitters seeded identically simulate bit-for-bit identically', () => {
    expect(simulate(42)).toEqual(simulate(42));
  });

  it('different seeds diverge', () => {
    expect(simulate(42)).not.toEqual(simulate(43));
  });
});
