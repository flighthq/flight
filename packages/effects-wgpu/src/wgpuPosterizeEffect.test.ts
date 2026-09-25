import {
  applyPosterizeEffectToWgpu,
  wgpuPosterizeEffectRunner,
  registerWgpuPosterizeEffect,
} from './wgpuPosterizeEffect.ts';

describe('applyPosterizeEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyPosterizeEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuPosterizeEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuPosterizeEffect).toBeTypeOf('function');
  });
});

describe('wgpuPosterizeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuPosterizeEffectRunner).toBe('function');
  });
});
