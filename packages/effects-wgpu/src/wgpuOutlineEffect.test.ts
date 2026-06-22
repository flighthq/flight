import { applyOutlineEffectToWgpu, defaultWgpuOutlineEffectRunner } from './wgpuOutlineEffect';

describe('applyOutlineEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyOutlineEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuOutlineEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuOutlineEffectRunner).toBe('function');
  });
});
