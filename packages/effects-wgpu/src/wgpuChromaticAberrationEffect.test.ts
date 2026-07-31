import {
  applyChromaticAberrationEffectToWgpu,
  defaultWgpuChromaticAberrationEffectRunner,
  registerWgpuChromaticAberrationEffect,
} from './wgpuChromaticAberrationEffect';

describe('applyChromaticAberrationEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyChromaticAberrationEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuChromaticAberrationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuChromaticAberrationEffectRunner).toBe('function');
  });
});

describe('registerWgpuChromaticAberrationEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuChromaticAberrationEffect).toBeTypeOf('function');
  });
});
