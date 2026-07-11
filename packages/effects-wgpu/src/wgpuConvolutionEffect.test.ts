import { applyConvolutionEffectToWgpu, defaultWgpuConvolutionEffectRunner } from './wgpuConvolutionEffect';

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
