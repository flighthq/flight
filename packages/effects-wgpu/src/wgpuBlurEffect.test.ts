import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import {
  applyBlurEffectToWgpu,
  applyGaussianBlurToWgpu,
  defaultWgpuBlurEffectRunner,
  registerWgpuBlurEffect,
} from './wgpuBlurEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

beforeAll(() => installWgpuMock());

describe('applyBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBlurEffectToWgpu).toBe('function');
  });
});

describe('applyGaussianBlurToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGaussianBlurToWgpu).toBe('function');
  });
});

describe('defaultWgpuBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBlurEffectRunner).toBe('function');
  });
});

describe('registerWgpuBlurEffect', () => {
  it('registers the default runner under BlurEffect', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuBlurEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'BlurEffect')).toBe(defaultWgpuBlurEffectRunner);
  });
});
