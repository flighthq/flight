import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createBevelEffect,
  getBevelEffectPadding,
  initializeBevelEffect,
  registerBevelEffectPaddingResolver,
} from './bevelEffect';

describe('createBevelEffect', () => {
  it('tags the intent type', () => {
    expect(createBevelEffect().kind).toBe('BevelEffect');
  });

  it('carries options', () => {
    expect(createBevelEffect({ sourceMode: 'knockout', strength: 2 })).toMatchObject({
      sourceMode: 'knockout',
      strength: 2,
    });
  });
});

describe('getBevelEffectPadding', () => {
  it('adds the directional offset only to the reached sides of the Gaussian footprint', () => {
    expect(getBevelEffectPadding(createBevelEffect({ angle: 180, blurX: 2, blurY: 3, distance: 5 }))).toEqual({
      bottom: 9,
      left: 11,
      right: 6,
      top: 9,
    });
  });
});

describe('initializeBevelEffect', () => {
  it('is the construction initializer of createBevelEffect', () => {
    expect(typeof initializeBevelEffect).toBe('function');
  });
});
describe('registerBevelEffectPaddingResolver', () => {
  it('registers the bevel footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerBevelEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('BevelEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
