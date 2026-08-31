import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import {
  applyContactShadowsEffectToWgpu,
  defaultWgpuContactShadowsEffectRunner,
  registerWgpuContactShadowsEffect,
} from './wgpuContactShadowsEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';
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
    applyContactShadowsEffectToWgpu({} as never, {} as never, {} as never, {
      distance: 3,
      kind: 'ContactShadowsEffect',
      opacity: 0.75,
      samples: 24,
    });

    expect(wgpuSsaoEffectMod.applySsaoEffectToWgpu).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {
        intensity: 0.75,
        kind: 'SsaoEffect',
        radius: 3,
        samples: 24,
      },
    );
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
