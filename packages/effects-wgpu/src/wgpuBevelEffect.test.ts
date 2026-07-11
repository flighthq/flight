import { applyBevelEffectToWgpu, defaultWgpuBevelEffectRunner } from './wgpuBevelEffect';

describe('applyBevelEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBevelEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBevelEffectRunner).toBe('function');
  });
});
