import { applyToneMapEffectToWgpu, wgpuToneMapEffectRunner, registerWgpuToneMapEffect } from './wgpuToneMapEffect';

describe('applyToneMapEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuToneMapEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuToneMapEffect).toBeTypeOf('function');
  });
});

describe('wgpuToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuToneMapEffectRunner).toBe('function');
  });
});
