import { applyBloomEffectToWgpu, defaultWgpuBloomEffectRunner, registerWgpuBloomEffect } from './wgpuBloomEffect';

describe('applyBloomEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBloomEffectRunner).toBe('function');
  });
});

describe('registerWgpuBloomEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuBloomEffect).toBeTypeOf('function');
  });
});
