import {
  applyVignetteEffectToWgpu,
  defaultWgpuVignetteEffectRunner,
  registerWgpuVignetteEffect,
} from './wgpuVignetteEffect';

describe('applyVignetteEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuVignetteEffectRunner).toBe('function');
  });
});

describe('registerWgpuVignetteEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuVignetteEffect).toBeTypeOf('function');
  });
});
