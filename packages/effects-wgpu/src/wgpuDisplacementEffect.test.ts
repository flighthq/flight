import {
  applyDisplacementEffectToWgpu,
  defaultWgpuDisplacementEffectRunner,
  registerWgpuDisplacementEffect,
} from './wgpuDisplacementEffect';

describe('applyDisplacementEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDisplacementEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuDisplacementEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDisplacementEffectRunner).toBe('function');
  });
});

describe('registerWgpuDisplacementEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuDisplacementEffect).toBeTypeOf('function');
  });
});
