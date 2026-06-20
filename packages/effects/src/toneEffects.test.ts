import { computeBloomBlurRadius, createBloomEffect, createExposureEffect, createToneMapEffect } from './toneEffects';

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
    expect(createBloomEffect().type).toBe('bloom');
  });

  it('carries options', () => {
    expect(createBloomEffect({ threshold: 0.5, intensity: 2 })).toMatchObject({ threshold: 0.5, intensity: 2 });
  });
});

describe('createExposureEffect', () => {
  it('tags the intent type', () => {
    expect(createExposureEffect({ exposure: 1 }).type).toBe('exposure');
  });
});

describe('createToneMapEffect', () => {
  it('tags the intent type and operator', () => {
    expect(createToneMapEffect({ operator: 'aces' })).toMatchObject({ type: 'toneMap', operator: 'aces' });
  });
});
