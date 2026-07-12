import { applyPosterizeEffectToWgpu, defaultWgpuPosterizeEffectRunner } from './wgpuPosterizeEffect';

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
