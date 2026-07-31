import {
  applyToneMapEffectToWgpu,
  defaultWgpuToneMapEffectRunner,
  registerWgpuToneMapEffect,
} from './wgpuToneMapEffect';

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

describe('registerWgpuToneMapEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuToneMapEffect).toBeTypeOf('function');
  });
});
