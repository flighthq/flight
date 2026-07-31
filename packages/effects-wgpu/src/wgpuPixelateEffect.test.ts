import {
  applyPixelateEffectToWgpu,
  defaultWgpuPixelateEffectRunner,
  registerWgpuPixelateEffect,
} from './wgpuPixelateEffect';

describe('applyPixelateEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuPixelateEffectRunner).toBe('function');
  });
});

describe('registerWgpuPixelateEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuPixelateEffect).toBeTypeOf('function');
  });
});
