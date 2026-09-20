import { createContactShadowsEffect } from '@flighthq/effects/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import {
  applyContactShadowsEffectToWgpu,
  wgpuContactShadowsEffectRunner,
  registerWgpuContactShadowsEffect,
} from './wgpuContactShadowsEffect';
import { getWgpuEffectRunner } from './wgpuEffectRegistry';
import * as wgpuSsaoEffectMod from './wgpuSsaoEffect';

beforeAll(() => {
  installWgpuMock();
});

beforeEach(() => {
  vi.spyOn(wgpuSsaoEffectMod, 'applySsaoEffectToWgpu').mockImplementation((() => {}) as never);
});

afterEach(() => vi.restoreAllMocks());

describe('applyContactShadowsEffectToWgpu', () => {
  it('maps the contact descriptor into the shared local-occlusion realization', () => {
    applyContactShadowsEffectToWgpu(
      {} as never,
      {} as never,
      {} as never,
      createContactShadowsEffect({
        distance: 3,
        opacity: 0.75,
        samples: 24,
      }),
    );

    expect(wgpuSsaoEffectMod.applySsaoEffectToWgpu).toHaveBeenCalledWith(
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

describe('registerWgpuContactShadowsEffect', () => {
  it('installs the contact-shadows runner on the supplied state', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuContactShadowsEffect(state);
    expect(getWgpuEffectRunner(state, 'ContactShadowsEffect')).toBe(wgpuContactShadowsEffectRunner);
  });
});

describe('wgpuContactShadowsEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuContactShadowsEffectRunner).toBe('function');
  });
});
