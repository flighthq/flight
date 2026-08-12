import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createContactShadowsEffect,
  getContactShadowsEffectPadding,
  registerContactShadowsEffectPaddingResolver,
} from './contactShadowsEffect';

describe('createContactShadowsEffect', () => {
  it('carries options', () => {
    expect(createContactShadowsEffect({ opacity: 0.8, samples: 32 })).toMatchObject({
      opacity: 0.8,
      samples: 32,
    });
  });

  it('tags the intent type', () => {
    expect(createContactShadowsEffect().kind).toBe('ContactShadowsEffect');
  });
});

describe('getContactShadowsEffectPadding', () => {
  it('keeps the screen-space depth treatment inside the current target', () => {
    expect(getContactShadowsEffectPadding(createContactShadowsEffect({ distance: 8 }))).toEqual({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    });
  });
});

describe('registerContactShadowsEffectPaddingResolver', () => {
  it('registers the explicit zero footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerContactShadowsEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('ContactShadowsEffect')).toBe(
      true,
    );
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
