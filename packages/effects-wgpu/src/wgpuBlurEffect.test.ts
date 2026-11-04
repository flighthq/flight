import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import {
  applyBlurEffectToWgpu,
  applyGaussianBlurToWgpu,
  wgpuBlurEffectRunner,
  registerWgpuBlurEffect,
} from './wgpuBlurEffect.ts';
import { getWgpuEffectRunner } from './wgpuEffectRegistry.ts';

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

describe('registerWgpuBlurEffect', () => {
  it('registers the default runner under BlurEffect', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuBlurEffect(state);
    expect(getWgpuEffectRunner(state, 'BlurEffect')).toBe(wgpuBlurEffectRunner);
  });
});

describe('wgpuBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuBlurEffectRunner).toBe('function');
  });
});
