import { applyKuwaharaEffectToWgpu, defaultWgpuKuwaharaEffectRunner } from './wgpuKuwaharaEffect';

describe('applyKuwaharaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyKuwaharaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuKuwaharaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuKuwaharaEffectRunner).toBe('function');
  });
});
