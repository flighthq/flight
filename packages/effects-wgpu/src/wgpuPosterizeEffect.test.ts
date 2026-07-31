import {
  applyPosterizeEffectToWgpu,
  defaultWgpuPosterizeEffectRunner,
  registerWgpuPosterizeEffect,
} from './wgpuPosterizeEffect';

describe('applyPosterizeEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyPosterizeEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuPosterizeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuPosterizeEffectRunner).toBe('function');
  });
});

describe('registerWgpuPosterizeEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuPosterizeEffect).toBeTypeOf('function');
  });
});
