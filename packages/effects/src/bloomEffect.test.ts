import { computeBloomBlurRadius, computeBloomIntensity, computeBloomThreshold, createBloomEffect } from './bloomEffect';

describe('computeBloomBlurRadius', () => {
  it('defaults to 8 when radius is unset', () => {
    expect(computeBloomBlurRadius(createBloomEffect())).toBe(8);
  });

  it('clamps negative radius to zero', () => {
    expect(computeBloomBlurRadius(createBloomEffect({ radius: -4 }))).toBe(0);
  });
});

describe('computeBloomIntensity', () => {
  it('defaults to 1 when intensity is unset', () => {
    expect(computeBloomIntensity(createBloomEffect())).toBe(1);
  });

  it('passes through an explicit intensity', () => {
    expect(computeBloomIntensity(createBloomEffect({ intensity: 2.5 }))).toBe(2.5);
  });
});

describe('computeBloomThreshold', () => {
  it('defaults to 0.8 when threshold is unset', () => {
    expect(computeBloomThreshold(createBloomEffect())).toBe(0.8);
  });

  it('passes through an explicit threshold', () => {
    expect(computeBloomThreshold(createBloomEffect({ threshold: 0.25 }))).toBe(0.25);
  });
});

describe('createBloomEffect', () => {
  it('tags the intent type', () => {
    expect(createBloomEffect().kind).toBe('BloomEffect');
  });

  it('carries options', () => {
    expect(createBloomEffect({ threshold: 0.5, intensity: 2 })).toMatchObject({ threshold: 0.5, intensity: 2 });
  });
});
