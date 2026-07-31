import {
  applyScreenSpaceFogEffectToWgpu,
  defaultWgpuScreenSpaceFogEffectRunner,
  registerWgpuScreenSpaceFogEffect,
} from './wgpuScreenSpaceFogEffect';

describe('applyScreenSpaceFogEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('registerWgpuScreenSpaceFogEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuScreenSpaceFogEffect).toBeTypeOf('function');
  });
});
