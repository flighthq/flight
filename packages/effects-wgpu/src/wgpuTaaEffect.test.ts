import { applyTaaEffectToWgpu, defaultWgpuTaaEffectRunner } from './wgpuTaaEffect';

describe('applyTaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyTaaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuTaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuTaaEffectRunner).toBe('function');
  });
});
