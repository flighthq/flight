import { applyMedianEffectToWgpu, defaultWgpuMedianEffectRunner } from './wgpuMedianEffect';

describe('applyMedianEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyMedianEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuMedianEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuMedianEffectRunner).toBe('function');
  });
});
