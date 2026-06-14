import { createParticleEmitter } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState } from './particleEmitterState';
import { updateParticleEmitter } from './updateParticleEmitter';
import { normalizeParticleEmitterConfig, validateParticleEmitterConfig } from './validateParticleEmitterConfig';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

describe('normalizeParticleEmitterConfig', () => {
  it('leaves a valid config materially unchanged', () => {
    const input = createParticleEmitterConfig({ spawnRate: 25, maxParticles: 500, lifetimeMin: 1, lifetimeMax: 2 });
    const out = normalizeParticleEmitterConfig(input);
    expect(out.spawnRate).toBe(25);
    expect(out.maxParticles).toBe(500);
    expect(out.lifetimeMin).toBe(1);
    expect(out.lifetimeMax).toBe(2);
  });

  it('replaces non-finite fields with their defaults', () => {
    const out = normalizeParticleEmitterConfig({ gravityY: NaN, spawnRate: Infinity, lifetimeMax: -Infinity });
    expect(out.gravityY).toBe(0); // default
    expect(out.spawnRate).toBe(10); // default
    expect(Number.isFinite(out.lifetimeMax)).toBe(true);
  });

  it('clamps negatives and floors integer fields', () => {
    const out = normalizeParticleEmitterConfig({
      maxParticles: -3,
      spawnRate: -10,
      burstCount: 4.7,
      frameCount: 0,
      emitterRadius: -50,
    });
    expect(out.maxParticles).toBe(0);
    expect(out.spawnRate).toBe(0);
    expect(out.burstCount).toBe(4);
    expect(out.frameCount).toBe(1);
    expect(out.emitterRadius).toBe(0);
  });

  it('keeps regionIdMax >= regionIdMin', () => {
    const out = normalizeParticleEmitterConfig({ regionIdMin: 5, regionIdMax: 2 });
    expect(out.regionIdMax).toBeGreaterThanOrEqual(out.regionIdMin);
  });

  it('drops a curve containing non-finite samples (falls back to linear)', () => {
    const out = normalizeParticleEmitterConfig({
      alphaCurve: [1, NaN, 0],
      scaleCurve: [],
      colorCurve: [0, 0, 0, 1, 1, 1],
    });
    expect(out.alphaCurve).toBeNull(); // had NaN → dropped
    expect(out.scaleCurve).toBeNull(); // empty → dropped
    expect(out.colorCurve).not.toBeNull(); // valid → kept
  });

  it('validate flags a non-finite curve sample as an error', () => {
    const issues = validateParticleEmitterConfig(createParticleEmitterConfig({ alphaCurve: [0, NaN, 1] }));
    expect(issues.some((i) => i.field === 'alphaCurve' && i.severity === 'error')).toBe(true);
  });

  it('produces a config that simulates without NaN poisoning', () => {
    // A pathologically corrupt config that would otherwise inject NaN everywhere.
    const corrupt = createParticleEmitterConfig({
      spawnRate: NaN,
      lifetimeMin: NaN,
      lifetimeMax: NaN,
      gravityY: Infinity,
      speedMin: NaN,
      speedMax: NaN,
    });
    const safe = normalizeParticleEmitterConfig(corrupt);
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    for (let i = 0; i < 30; i++) updateParticleEmitter(emitter, state, safe, 1 / 60);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
    for (let i = 0; i < emitter.data.particleCount * 4; i++) {
      expect(Number.isFinite(emitter.data.transforms[i])).toBe(true);
    }
  });
});

describe('validateParticleEmitterConfig', () => {
  it('reports no issues for a default config', () => {
    expect(validateParticleEmitterConfig(createParticleEmitterConfig())).toEqual([]);
  });

  it('flags non-finite numeric fields as errors', () => {
    const config = createParticleEmitterConfig({ gravityY: NaN, spawnRate: Infinity });
    const issues = validateParticleEmitterConfig(config);
    const errors = issues.filter((i) => i.severity === 'error').map((i) => i.field);
    expect(errors).toContain('gravityY');
    expect(errors).toContain('spawnRate');
  });

  it('flags negative counts/rates as warnings', () => {
    const issues = validateParticleEmitterConfig(createParticleEmitterConfig({ spawnRate: -5, maxParticles: -1 }));
    expect(issues.some((i) => i.field === 'spawnRate' && i.severity === 'warning')).toBe(true);
    expect(issues.some((i) => i.field === 'maxParticles')).toBe(true);
  });

  it('flags inverted min/max ranges', () => {
    const issues = validateParticleEmitterConfig(createParticleEmitterConfig({ lifetimeMin: 5, lifetimeMax: 1 }));
    expect(issues.some((i) => i.field === 'lifetimeMin')).toBe(true);
  });

  it('flags alpha outside the 0–1 range', () => {
    const issues = validateParticleEmitterConfig(createParticleEmitterConfig({ alphaStart: 2 }));
    expect(issues.some((i) => i.field === 'alphaStart')).toBe(true);
  });
});
