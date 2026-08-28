vi.mock('./glSsaoEffect', () => ({ applySsaoEffectToGl: vi.fn() }));

import { createGlContextFromCanvasElement, createGlRenderState } from '@flighthq/render-gl/contract';

import {
  applyContactShadowsEffectToGl,
  defaultGlContactShadowsEffectRunner,
  registerGlContactShadowsEffect,
} from './glContactShadowsEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import { applySsaoEffectToGl } from './glSsaoEffect';

describe('applyContactShadowsEffectToGl', () => {
  it('maps the contact descriptor into the shared local-occlusion realization', () => {
    applyContactShadowsEffectToGl({} as never, {} as never, {} as never, {
      distance: 3,
      kind: 'ContactShadowsEffect',
      opacity: 0.75,
      samples: 24,
    });

    expect(applySsaoEffectToGl).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), {
      intensity: 0.75,
      kind: 'SsaoEffect',
      radius: 3,
      samples: 24,
    });
  });
});

describe('defaultGlContactShadowsEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlContactShadowsEffectRunner).toBe('function');
  });
});

describe('registerGlContactShadowsEffect', () => {
  it('installs the contact-shadows runner on the supplied state', () => {
    const state = createGlRenderState(createGlContextFromCanvasElement(document.createElement('canvas')));
    registerGlContactShadowsEffect(state);
    expect(getGlRenderEffectRunner(state, 'ContactShadowsEffect')).toBe(defaultGlContactShadowsEffectRunner);
  });
});
