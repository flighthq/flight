import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import {
  getWgpuRenderEffectRunner,
  hasWgpuRenderEffectRunner,
  registerWgpuRenderEffect,
} from './wgpuRenderEffectRegistry';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuRenderEffectRunner', () => {
  it('returns null when no runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(null);
  });
});

describe('hasWgpuRenderEffectRunner', () => {
  it('returns false when no runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(hasWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(false);
  });

  it('returns true after a runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuRenderEffect(state, 'VignetteEffect', vi.fn());
    expect(hasWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(true);
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
