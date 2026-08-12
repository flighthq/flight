import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createDisplacementEffect,
  getDisplacementEffectPadding,
  registerDisplacementEffectPaddingResolver,
} from './displacementEffect';

describe('createDisplacementEffect', () => {
  it('tags the intent type', () => {
    expect(createDisplacementEffect().kind).toBe('DisplacementEffect');
  });

  it('carries options', () => {
    expect(createDisplacementEffect({ intensity: 10, frequency: 14, seed: 2 })).toMatchObject({
      intensity: 10,
      frequency: 14,
      seed: 2,
    });
  });
});

describe('getDisplacementEffectPadding', () => {
  it('covers the shader maximum two-axis sine warp', () => {
    expect(getDisplacementEffectPadding(createDisplacementEffect({ intensity: 5 }))).toEqual({
      bottom: 5,
      left: 8,
      right: 8,
      top: 5,
    });
  });
});

describe('registerDisplacementEffectPaddingResolver', () => {
  it('registers the displacement footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerDisplacementEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('DisplacementEffect')).toBe(
      true,
    );
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
