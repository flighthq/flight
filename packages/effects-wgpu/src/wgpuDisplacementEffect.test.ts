import {
  applyDisplacementEffectToWgpu,
  wgpuDisplacementEffectRunner,
  registerWgpuDisplacementEffect,
} from './wgpuDisplacementEffect.ts';

describe('applyDisplacementEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDisplacementEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuDisplacementEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuDisplacementEffect).toBeTypeOf('function');
  });
});

describe('wgpuDisplacementEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuDisplacementEffectRunner).toBe('function');
  });
});
