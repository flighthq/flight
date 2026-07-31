import {
  applyConvolutionEffectToWgpu,
  defaultWgpuConvolutionEffectRunner,
  registerWgpuConvolutionEffect,
} from './wgpuConvolutionEffect';

describe('applyConvolutionEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyConvolutionEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuConvolutionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuConvolutionEffectRunner).toBe('function');
  });
});

describe('registerWgpuConvolutionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuConvolutionEffect).toBeTypeOf('function');
  });
});
