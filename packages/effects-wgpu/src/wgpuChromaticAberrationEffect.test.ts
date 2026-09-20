import {
  applyChromaticAberrationEffectToWgpu,
  wgpuChromaticAberrationEffectRunner,
  registerWgpuChromaticAberrationEffect,
} from './wgpuChromaticAberrationEffect';

describe('applyChromaticAberrationEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyChromaticAberrationEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuChromaticAberrationEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuChromaticAberrationEffect).toBeTypeOf('function');
  });
});

describe('wgpuChromaticAberrationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuChromaticAberrationEffectRunner).toBe('function');
  });
});
