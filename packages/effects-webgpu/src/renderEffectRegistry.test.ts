import { createWebGPURenderStateForTest, installWebGPUMock } from '@flighthq/render-webgpu';

import { getWebGPURenderEffectRunner, registerWebGPURenderEffect } from './renderEffectRegistry';

beforeAll(() => {
  installWebGPUMock();
});

describe('getWebGPURenderEffectRunner', () => {
  it('returns null when no runner is registered for the type', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(getWebGPURenderEffectRunner(state, 'vignette')).toBe(null);
  });
});

describe('registerWebGPURenderEffect', () => {
  it('registers a runner retrievable by its type', async () => {
    const state = await createWebGPURenderStateForTest();
    const runner = vi.fn();
    registerWebGPURenderEffect(state, 'vignette', runner);
    expect(getWebGPURenderEffectRunner(state, 'vignette')).toBe(runner);
  });
});
