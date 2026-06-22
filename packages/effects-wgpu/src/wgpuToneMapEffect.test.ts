import { applyToneMapEffectToWgpu, defaultWgpuToneMapEffectRunner } from './wgpuToneMapEffect';

describe('applyToneMapEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuToneMapEffectRunner).toBe('function');
  });
});
