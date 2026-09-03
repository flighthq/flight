import { createContactShadowsEffect } from '@flighthq/effects/contract';
import {
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlContextFromCanvasElement,
  createGlRenderState,
} from '@flighthq/render-gl/contract';

import {
  applyContactShadowsEffectToGl,
  defaultGlContactShadowsEffectRunner,
  registerGlContactShadowsEffect,
} from './glContactShadowsEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import * as glSsaoEffect from './glSsaoEffect';

beforeEach(() => {
  vi.spyOn(glSsaoEffect, 'applySsaoEffectToGl').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyContactShadowsEffectToGl', () => {
  it('maps the contact descriptor into the shared local-occlusion realization', () => {
    applyContactShadowsEffectToGl(
      {} as never,
      {} as never,
      {} as never,
      createContactShadowsEffect({
        distance: 3,
        opacity: 0.75,
        samples: 24,
      }),
    );

    expect(glSsaoEffect.applySsaoEffectToGl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        intensity: 0.75,
        kind: 'SsaoEffect',
        radius: 3,
        samples: 24,
      }),
    );
  });
});

describe('defaultGlContactShadowsEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlContactShadowsEffectRunner).toBe('function');
  });
});

describe('registerGlContactShadowsEffect', () => {
  it('installs the contact-shadows runner on the supplied state', () => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );
    registerGlContactShadowsEffect(state);
    expect(getGlRenderEffectRunner(state, 'ContactShadowsEffect')).toBe(defaultGlContactShadowsEffectRunner);
  });
});
