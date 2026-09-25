import {
  applyPixelateEffectToWgpu,
  wgpuPixelateEffectRunner,
  registerWgpuPixelateEffect,
} from './wgpuPixelateEffect.ts';

describe('applyPixelateEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuPixelateEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuPixelateEffect).toBeTypeOf('function');
  });
});

describe('wgpuPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuPixelateEffectRunner).toBe('function');
  });
});
