import { applyInvertEffectToWgpu, defaultWgpuInvertEffectRunner } from './wgpuInvertEffect';

describe('applyInvertEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyInvertEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuInvertEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuInvertEffectRunner).toBe('function');
  });
});
