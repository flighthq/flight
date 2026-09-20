import { applyKuwaharaEffectToWgpu, wgpuKuwaharaEffectRunner, registerWgpuKuwaharaEffect } from './wgpuKuwaharaEffect';

describe('applyKuwaharaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyKuwaharaEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuKuwaharaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuKuwaharaEffect).toBeTypeOf('function');
  });
});

describe('wgpuKuwaharaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuKuwaharaEffectRunner).toBe('function');
  });
});
