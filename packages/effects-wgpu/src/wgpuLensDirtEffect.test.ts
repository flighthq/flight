import { applyLensDirtEffectToWgpu, defaultWgpuLensDirtEffectRunner } from './wgpuLensDirtEffect';

describe('applyLensDirtEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuLensDirtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuLensDirtEffectRunner).toBe('function');
  });
});
