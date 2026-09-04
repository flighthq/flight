import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createTiltShiftEffect,
  getTiltShiftEffectPadding,
  initializeTiltShiftEffect,
  registerTiltShiftEffectPaddingResolver,
} from './tiltShiftEffect';

describe('createTiltShiftEffect', () => {
  it('tags the intent type', () => {
    expect(createTiltShiftEffect().kind).toBe('TiltShiftEffect');
  });

  it('carries options', () => {
    expect(createTiltShiftEffect({ center: 0.5, width: 0.2, blur: 4 })).toMatchObject({
      center: 0.5,
      width: 0.2,
      blur: 4,
    });
  });
});

describe('getTiltShiftEffectPadding', () => {
  it('covers the seven-tap vertical blur reach', () => {
    expect(getTiltShiftEffectPadding(createTiltShiftEffect({ blur: 2.5 }))).toEqual({
      bottom: 8,
      left: 0,
      right: 0,
      top: 8,
    });
  });
});

describe('initializeTiltShiftEffect', () => {
  it('is the construction initializer of createTiltShiftEffect', () => {
    expect(typeof initializeTiltShiftEffect).toBe('function');
  });
});
describe('registerTiltShiftEffectPaddingResolver', () => {
  it('registers the tilt-shift footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerTiltShiftEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('TiltShiftEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
