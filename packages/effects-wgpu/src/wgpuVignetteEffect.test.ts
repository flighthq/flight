import {
  applyVignetteEffectToWgpu,
  wgpuVignetteEffectRunner,
  registerWgpuVignetteEffect,
} from './wgpuVignetteEffect.ts';

describe('applyVignetteEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuVignetteEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuVignetteEffect).toBeTypeOf('function');
  });
});

describe('wgpuVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuVignetteEffectRunner).toBe('function');
  });
});
