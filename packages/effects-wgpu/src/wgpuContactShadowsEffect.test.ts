vi.mock('./wgpuSsaoEffect', () => ({ applySsaoEffectToWgpu: vi.fn() }));

import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import {
  applyContactShadowsEffectToWgpu,
  defaultWgpuContactShadowsEffectRunner,
  registerWgpuContactShadowsEffect,
} from './wgpuContactShadowsEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';
import { applySsaoEffectToWgpu } from './wgpuSsaoEffect';

beforeAll(() => {
  installWgpuMock();
});

describe('applyContactShadowsEffectToWgpu', () => {
  it('maps the contact descriptor into the shared local-occlusion realization', () => {
    applyContactShadowsEffectToWgpu({} as never, {} as never, {} as never, {
      distance: 3,
      kind: 'ContactShadowsEffect',
      opacity: 0.75,
      samples: 24,
    });

    expect(applySsaoEffectToWgpu).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), {
      intensity: 0.75,
      kind: 'SsaoEffect',
      radius: 3,
      samples: 24,
    });
  });
});

describe('defaultWgpuContactShadowsEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuContactShadowsEffectRunner).toBe('function');
  });
});

describe('registerWgpuContactShadowsEffect', () => {
  it('installs the contact-shadows runner on the supplied state', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuContactShadowsEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'ContactShadowsEffect')).toBe(defaultWgpuContactShadowsEffectRunner);
  });
});
