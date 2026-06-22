import { applySepiaEffectToWgpu, defaultWgpuSepiaEffectRunner } from './wgpuSepiaEffect';

describe('applySepiaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySepiaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSepiaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSepiaEffectRunner).toBe('function');
  });
});
