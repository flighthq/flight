import { computeBloomBlurRadius, createBloomEffect } from './bloomEffect';

describe('computeBloomBlurRadius', () => {
  it('defaults to 8 when radius is unset', () => {
    expect(computeBloomBlurRadius(createBloomEffect())).toBe(8);
  });

  it('clamps negative radius to zero', () => {
    expect(computeBloomBlurRadius(createBloomEffect({ radius: -4 }))).toBe(0);
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
