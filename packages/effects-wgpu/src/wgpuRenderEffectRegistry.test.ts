import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { getWgpuRenderEffectRunner, registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuRenderEffectRunner', () => {
  it('returns null when no runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(null);
  });
});

describe('registerWgpuRenderEffect', () => {
  it('registers a runner retrievable by its kind', async () => {
    const state = await createWgpuRenderStateForTest();
    const runner = vi.fn();
    registerWgpuRenderEffect(state, 'VignetteEffect', runner);
    expect(getWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(runner);
  });
});
