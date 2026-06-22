import { applySharpenEffectToWgpu, defaultWgpuSharpenEffectRunner } from './wgpuSharpenEffect';

describe('applySharpenEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySharpenEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSharpenEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSharpenEffectRunner).toBe('function');
  });
});
