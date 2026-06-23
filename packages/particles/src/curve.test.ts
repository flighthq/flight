import { createParticleEmitter } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types';

import {
  buildParticleColorCurve,
  buildParticleCurve,
  particleColorCurveFromKeyframes,
  particleColorCurveToKeyframes,
  particleCurveFromKeyframes,
  particleCurveToKeyframes,
  sampleParticleColorCurve,
  sampleParticleCurve,
} from './curve';
import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState } from './particleEmitterState';
import { updateParticleEmitter } from './updateParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

describe('buildParticleColorCurve', () => {
  it('bakes an RGB function into an interleaved LUT', () => {
    const lut = buildParticleColorCurve((t) => [t, 0, 1 - t], 3);
    expect(lut.length).toBe(9);
    expect(lut[0]).toBe(0); // R at t=0
    expect(lut[2]).toBe(1); // B at t=0
  });
});

describe('buildParticleCurve', () => {
  it('bakes a scalar function into a LUT sampled at the endpoints', () => {
    const lut = buildParticleCurve((t) => t * t, 5);
    expect(lut.length).toBe(5);
    expect(lut[0]).toBe(0);
    expect(lut[4]).toBe(1);
    expect(sampleParticleCurve(lut, 0.5)).toBeCloseTo(0.25, 1);
  });
});

describe('lifetime curves in updateParticleEmitter', () => {
  function spawnOne(configOverrides: Parameters<typeof createParticleEmitterConfig>[0]) {
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
    updateParticleEmitter(emitter, state, config, 1); // spawn one particle
    return { emitter, state, config };
  }

  it('alphaCurve drives alpha non-linearly over lifetime', () => {
    // A curve that is 1 at birth, dips to 0 at mid-life, back to 1 at death.
    const { emitter, state, config } = spawnOne({ alphaCurve: [1, 0, 1] });
    updateParticleEmitter(emitter, state, config, 0.5); // → mid-life
    expect(emitter.data.alphas[0]).toBeCloseTo(0, 2);
  });

  it('colorCurve overrides the start/end gradient', () => {
    // green at birth, red at death (interleaved RGB).
    const { emitter, state, config } = spawnOne({
      colorCurve: [0, 1, 0, 1, 0, 0],
      colorStartR: 0.123, // would be used by the linear path; curve must win
    });
    updateParticleEmitter(emitter, state, config, 0.5);
    expect(emitter.data.colors[0]).toBeCloseTo(0.5); // R halfway
    expect(emitter.data.colors[1]).toBeCloseTo(0.5); // G halfway
  });

  it('scaleCurve multiplies the spawn scale', () => {
    const { emitter, state, config } = spawnOne({
      scaleMin: 2,
      scaleMax: 2,
      scaleCurve: [1, 0.5, 0], // shrink to nothing
    });
    updateParticleEmitter(emitter, state, config, 0.5); // mid-life → factor 0.5
    expect(emitter.data.transforms[3]).toBeCloseTo(1, 2); // 2 * 0.5
  });

  it('sets curve-driven values at spawn time (t=0)', () => {
    const { emitter } = spawnOne({ alphaCurve: [0.25, 1] });
    expect(emitter.data.alphas[0]).toBeCloseTo(0.25, 2);
  });
});

describe('particleColorCurveFromKeyframes', () => {
  it('bakes an RGB timeline through its middle stop', () => {
    const lut = particleColorCurveFromKeyframes([
      { time: 0, r: 1, g: 0, b: 0 },
      { time: 0.5, r: 0, g: 1, b: 0 },
      { time: 1, r: 0, g: 0, b: 1 },
    ]);
    const out = [0, 0, 0];
    sampleParticleColorCurve(out, 0, lut, 0.5);
    expect(out[1]).toBeGreaterThan(0.8); // green at mid
  });

  it('an empty keyframe list yields a flat transparent curve', () => {
    const lut = particleColorCurveFromKeyframes([]);
    const out = [9, 9, 9];
    sampleParticleColorCurve(out, 0, lut, 0.5);
    expect(out).toEqual([0, 0, 0]);
  });
});

describe('particleColorCurveToKeyframes', () => {
  it('emits one RGB keyframe per LUT sample at uniform times', () => {
    const keys = particleColorCurveToKeyframes([1, 0, 0, 0, 0, 1]); // red → blue
    expect(keys).toEqual([
      { time: 0, r: 1, g: 0, b: 0 },
      { time: 1, r: 0, g: 0, b: 1 },
    ]);
  });

  it('round-trips a baked color curve back to keyframes', () => {
    const lut = particleColorCurveFromKeyframes([
      { time: 0, r: 1, g: 0, b: 0 },
      { time: 1, r: 0, g: 0, b: 1 },
    ]);
    const keys = particleColorCurveToKeyframes(lut);
    expect(keys[0]).toEqual({ time: 0, r: 1, g: 0, b: 0 });
    expect(keys[keys.length - 1]).toEqual({ time: 1, r: 0, g: 0, b: 1 });
  });

  it('handles empty and single-entry LUTs', () => {
    expect(particleColorCurveToKeyframes([])).toEqual([]);
    expect(particleColorCurveToKeyframes([0.2, 0.4, 0.6])).toEqual([{ time: 0, r: 0.2, g: 0.4, b: 0.6 }]);
  });
});

describe('particleCurveFromKeyframes', () => {
  it('interpolates a 3-stop scalar timeline through its middle stop', () => {
    const lut = particleCurveFromKeyframes([
      { time: 0, value: 0 },
      { time: 0.5, value: 1 },
      { time: 1, value: 0 },
    ]);
    expect(sampleParticleCurve(lut, 0)).toBeCloseTo(0, 2);
    expect(sampleParticleCurve(lut, 0.5)).toBeGreaterThan(0.9);
    expect(sampleParticleCurve(lut, 1)).toBeCloseTo(0, 2);
  });

  it('sorts unsorted keyframes by time', () => {
    const lut = particleCurveFromKeyframes([
      { time: 1, value: 10 },
      { time: 0, value: 0 },
    ]);
    expect(sampleParticleCurve(lut, 0)).toBeCloseTo(0, 1);
    expect(sampleParticleCurve(lut, 1)).toBeCloseTo(10, 1);
  });

  it('handles non-normalized key times by clamping at the ends', () => {
    const lut = particleCurveFromKeyframes([
      { time: 0.25, value: 2 },
      { time: 0.75, value: 6 },
    ]);
    expect(sampleParticleCurve(lut, 0)).toBeCloseTo(2, 1); // below first key → first value
    expect(sampleParticleCurve(lut, 1)).toBeCloseTo(6, 1); // above last key → last value
    expect(sampleParticleCurve(lut, 0.5)).toBeCloseTo(4, 1); // midway between keys
  });

  it('a single keyframe yields a constant curve', () => {
    const lut = particleCurveFromKeyframes([{ time: 0.5, value: 3 }]);
    expect(sampleParticleCurve(lut, 0)).toBeCloseTo(3);
    expect(sampleParticleCurve(lut, 1)).toBeCloseTo(3);
  });

  it('an empty keyframe list yields a flat zero curve', () => {
    const lut = particleCurveFromKeyframes([]);
    expect(sampleParticleCurve(lut, 0)).toBe(0);
    expect(sampleParticleCurve(lut, 1)).toBe(0);
  });
});

describe('particleCurveToKeyframes', () => {
  it('emits one keyframe per LUT sample at uniform times', () => {
    const keys = particleCurveToKeyframes([0, 0.5, 1]);
    expect(keys).toEqual([
      { time: 0, value: 0 },
      { time: 0.5, value: 0.5 },
      { time: 1, value: 1 },
    ]);
  });

  it('round-trips a baked scalar curve back to keyframes', () => {
    const lut = particleCurveFromKeyframes([
      { time: 0, value: 0 },
      { time: 1, value: 10 },
    ]);
    const keys = particleCurveToKeyframes(lut);
    expect(keys[0]).toEqual({ time: 0, value: 0 });
    expect(keys[keys.length - 1]).toEqual({ time: 1, value: 10 });
    // Reconstructing from the keyframes reproduces the original samples.
    expect(sampleParticleCurve(particleCurveFromKeyframes(keys, lut.length), 0.5)).toBeCloseTo(
      sampleParticleCurve(lut, 0.5),
      5,
    );
  });

  it('handles empty and single-entry LUTs', () => {
    expect(particleCurveToKeyframes([])).toEqual([]);
    expect(particleCurveToKeyframes([7])).toEqual([{ time: 0, value: 7 }]);
  });
});

describe('sampleParticleColorCurve', () => {
  it('interpolates interleaved RGB channels', () => {
    const lut = [1, 0, 0, 0, 0, 1]; // red → blue
    const out = [0, 0, 0];
    sampleParticleColorCurve(out, 0, lut, 0.5);
    expect(out[0]).toBeCloseTo(0.5); // R
    expect(out[1]).toBeCloseTo(0); // G
    expect(out[2]).toBeCloseTo(0.5); // B
  });

  it('writes at the given offset', () => {
    const lut = [0.2, 0.4, 0.6];
    const out = [9, 9, 9, 9, 9];
    sampleParticleColorCurve(out, 2, lut, 0);
    expect(out[2]).toBeCloseTo(0.2);
    expect(out[3]).toBeCloseTo(0.4);
    expect(out[4]).toBeCloseTo(0.6);
  });
});

describe('sampleParticleCurve', () => {
  it('returns endpoints at t=0 and t=1', () => {
    const lut = [0, 0.5, 1];
    expect(sampleParticleCurve(lut, 0)).toBe(0);
    expect(sampleParticleCurve(lut, 1)).toBe(1);
  });

  it('linearly interpolates between samples', () => {
    const lut = [0, 1]; // straight line 0→1
    expect(sampleParticleCurve(lut, 0.25)).toBeCloseTo(0.25);
    expect(sampleParticleCurve(lut, 0.5)).toBeCloseTo(0.5);
  });

  it('clamps out-of-range t', () => {
    const lut = [2, 4];
    expect(sampleParticleCurve(lut, -1)).toBe(2);
    expect(sampleParticleCurve(lut, 5)).toBe(4);
  });

  it('handles empty and single-entry curves', () => {
    expect(sampleParticleCurve([], 0.5)).toBe(0);
    expect(sampleParticleCurve([7], 0.5)).toBe(7);
  });
});
