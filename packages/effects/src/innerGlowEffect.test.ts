import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createInnerGlowEffect,
  getInnerGlowEffectPadding,
  initializeInnerGlowEffect,
  registerInnerGlowEffectPaddingResolver,
} from './innerGlowEffect';

describe('createInnerGlowEffect', () => {
  it('tags the intent type', () => {
    expect(createInnerGlowEffect().kind).toBe('InnerGlowEffect');
  });

  it('carries options', () => {
    expect(createInnerGlowEffect({ strength: 2 })).toMatchObject({ strength: 2 });
  });

  it('carries source mode', () => {
    expect(createInnerGlowEffect({ sourceMode: 'hide' })).toMatchObject({ sourceMode: 'hide' });
  });
});

describe('getInnerGlowEffectPadding', () => {
  it('uses a three-sigma Gaussian footprint', () => {
    expect(getInnerGlowEffectPadding(createInnerGlowEffect({ blurX: 2, blurY: 3 }))).toEqual({
      bottom: 9,
      left: 6,
      right: 6,
      top: 9,
    });
  });
});

describe('initializeInnerGlowEffect', () => {
  it('is the construction initializer of createInnerGlowEffect', () => {
    expect(typeof initializeInnerGlowEffect).toBe('function');
  });
});
describe('registerInnerGlowEffectPaddingResolver', () => {
  it('registers the inner-glow footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerInnerGlowEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('InnerGlowEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
