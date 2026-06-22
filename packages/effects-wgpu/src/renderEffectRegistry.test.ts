import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { getWgpuRenderEffectRunner, registerWgpuRenderEffect } from './renderEffectRegistry';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuRenderEffectRunner', () => {
  it('returns null when no runner is registered for the type', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderEffectRunner(state, 'vignette')).toBe(null);
  });
});

describe('registerWgpuRenderEffect', () => {
  it('registers a runner retrievable by its type', async () => {
    const state = await createWgpuRenderStateForTest();
    const runner = vi.fn();
    registerWgpuRenderEffect(state, 'vignette', runner);
    expect(getWgpuRenderEffectRunner(state, 'vignette')).toBe(runner);
  });
});
