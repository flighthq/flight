import { applyDisplacementEffectToWgpu, defaultWgpuDisplacementEffectRunner } from './wgpuDisplacementEffect';

describe('applyDisplacementEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDisplacementEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuDisplacementEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDisplacementEffectRunner).toBe('function');
  });
});
