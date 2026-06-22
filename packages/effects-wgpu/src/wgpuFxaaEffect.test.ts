import { applyFxaaEffectToWgpu, defaultWgpuFxaaEffectRunner } from './wgpuFxaaEffect';

describe('applyFxaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuFxaaEffectRunner).toBe('function');
  });
});
