import { createGodRaysEffect } from './godRaysEffect';
import {
  computeGodRaysAccumulationScale,
  computeGodRaysLightCenter,
  computeGodRaysSampleWeight,
  computeGodRaysStepSize,
} from './godRaysMath';

describe('computeGodRaysAccumulationScale', () => {
  it('is finite and positive for default parameters', () => {
    const scale = computeGodRaysAccumulationScale(createGodRaysEffect());
    expect(scale).toBeGreaterThan(0);
    expect(isFinite(scale)).toBe(true);
  });
  it('is 1/(samples*weight*exposure) for explicit values', () => {
    const effect = createGodRaysEffect({ samples: 50, weight: 0.5, exposure: 0.2 });
    expect(computeGodRaysAccumulationScale(effect)).toBeCloseTo(1 / (50 * 0.5 * 0.2), 6);
  });
});

describe('computeGodRaysLightCenter', () => {
  it('defaults to [0.5, 0.5]', () => {
    const out: [number, number] = [0, 0];
    computeGodRaysLightCenter(createGodRaysEffect(), out);
    expect(out[0]).toBe(0.5);
    expect(out[1]).toBe(0.5);
  });
  it('clamps to [0..1]', () => {
    const out: [number, number] = [0, 0];
    computeGodRaysLightCenter(createGodRaysEffect({ centerX: -1, centerY: 2 }), out);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1);
  });
});

describe('computeGodRaysSampleWeight', () => {
  it('decreases with sample index due to decay', () => {
    const effect = createGodRaysEffect({ decay: 0.9, weight: 1, exposure: 1 });
    const w0 = computeGodRaysSampleWeight(effect, 0);
    const w5 = computeGodRaysSampleWeight(effect, 5);
    expect(w0).toBeGreaterThan(w5);
  });
  it('sample 0 equals weight*exposure when decay applied once', () => {
    const effect = createGodRaysEffect({ decay: 0.96, weight: 0.4, exposure: 0.1 });
    expect(computeGodRaysSampleWeight(effect, 0)).toBeCloseTo(0.4 * 0.1, 6);
  });
});

describe('computeGodRaysStepSize', () => {
  it('returns zero step when pixel is at the light center', () => {
    const out: [number, number] = [1, 1];
    computeGodRaysStepSize(createGodRaysEffect({ centerX: 0.5, centerY: 0.5 }), 0.5, 0.5, out);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(0, 6);
  });
  it('step direction points toward light center', () => {
    const out: [number, number] = [0, 0];
    // pixel at top-left (0, 0), light at center (0.5, 0.5) => step should be positive
    computeGodRaysStepSize(createGodRaysEffect({ centerX: 0.5, centerY: 0.5, density: 1, samples: 10 }), 0, 0, out);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[1]).toBeGreaterThan(0);
  });
});
