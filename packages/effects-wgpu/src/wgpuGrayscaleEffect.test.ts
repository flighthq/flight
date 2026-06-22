import { applyGrayscaleEffectToWgpu, defaultWgpuGrayscaleEffectRunner } from './wgpuGrayscaleEffect';

describe('applyGrayscaleEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGrayscaleEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuGrayscaleEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuGrayscaleEffectRunner).toBe('function');
  });
});
