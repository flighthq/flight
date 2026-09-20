import { applyBloomEffectToWgpu, wgpuBloomEffectRunner, registerWgpuBloomEffect } from './wgpuBloomEffect';

describe('applyBloomEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuBloomEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuBloomEffect).toBeTypeOf('function');
  });
});

describe('wgpuBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuBloomEffectRunner).toBe('function');
  });
});
