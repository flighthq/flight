import {
  applyScreenSpaceFogEffectToWgpu,
  wgpuScreenSpaceFogEffectRunner,
  registerWgpuScreenSpaceFogEffect,
} from './wgpuScreenSpaceFogEffect';

describe('applyScreenSpaceFogEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuScreenSpaceFogEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuScreenSpaceFogEffect).toBeTypeOf('function');
  });
});

describe('wgpuScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuScreenSpaceFogEffectRunner).toBe('function');
  });
});
