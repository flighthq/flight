import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createInnerShadowEffect,
  getInnerShadowEffectPadding,
  initializeInnerShadowEffect,
  registerInnerShadowEffectPaddingResolver,
} from './innerShadowEffect';

describe('createInnerShadowEffect', () => {
  it('tags the intent type', () => {
    expect(createInnerShadowEffect().kind).toBe('InnerShadowEffect');
  });

  it('carries options', () => {
    expect(createInnerShadowEffect({ strength: 2 })).toMatchObject({ strength: 2 });
  });

  it('carries source mode', () => {
    expect(createInnerShadowEffect({ sourceMode: 'hide' })).toMatchObject({ sourceMode: 'hide' });
  });
});

describe('getInnerShadowEffectPadding', () => {
  it('preserves the directional exterior samples needed by the clipped inner pass', () => {
    expect(
      getInnerShadowEffectPadding(createInnerShadowEffect({ angle: 90, blurX: 2, blurY: 3, distance: 5 })),
    ).toEqual({
      bottom: 14,
      left: 6,
      right: 6,
      top: 9,
    });
  });
});

describe('initializeInnerShadowEffect', () => {
  it('is the construction initializer of createInnerShadowEffect', () => {
    expect(typeof initializeInnerShadowEffect).toBe('function');
  });
});
describe('registerInnerShadowEffectPaddingResolver', () => {
  it('registers the inner-shadow footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerInnerShadowEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('InnerShadowEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
