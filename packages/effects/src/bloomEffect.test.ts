import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  computeBloomBlurRadius,
  computeBloomIntensity,
  computeBloomThreshold,
  createBloomEffect,
  getBloomEffectPadding,
  initializeBloomEffect,
  registerBloomEffectPaddingResolver,
} from './bloomEffect';

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

describe('getBloomEffectPadding', () => {
  it('uses a three-sigma footprint for the blurred bright branch', () => {
    expect(getBloomEffectPadding(createBloomEffect({ radius: 2 }))).toEqual({
      bottom: 6,
      left: 6,
      right: 6,
      top: 6,
    });
  });
});

describe('initializeBloomEffect', () => {
  it('is the construction initializer of createBloomEffect', () => {
    expect(typeof initializeBloomEffect).toBe('function');
  });
});
describe('registerBloomEffectPaddingResolver', () => {
  it('registers the bloom footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerBloomEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('BloomEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
