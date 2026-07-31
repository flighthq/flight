import {
  applyKuwaharaEffectToWgpu,
  defaultWgpuKuwaharaEffectRunner,
  registerWgpuKuwaharaEffect,
} from './wgpuKuwaharaEffect';

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

describe('registerWgpuKuwaharaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuKuwaharaEffect).toBeTypeOf('function');
  });
});
