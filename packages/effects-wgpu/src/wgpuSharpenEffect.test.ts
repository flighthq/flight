import {
  applySharpenEffectToWgpu,
  defaultWgpuSharpenEffectRunner,
  registerWgpuSharpenEffect,
} from './wgpuSharpenEffect';

describe('applySharpenEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySharpenEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSharpenEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSharpenEffectRunner).toBe('function');
  });
});

describe('registerWgpuSharpenEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSharpenEffect).toBeTypeOf('function');
  });
});
