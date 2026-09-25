import {
  applyConvolutionEffectToWgpu,
  wgpuConvolutionEffectRunner,
  registerWgpuConvolutionEffect,
} from './wgpuConvolutionEffect.ts';

describe('applyConvolutionEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyConvolutionEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuConvolutionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuConvolutionEffect).toBeTypeOf('function');
  });
});

describe('wgpuConvolutionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuConvolutionEffectRunner).toBe('function');
  });
});
