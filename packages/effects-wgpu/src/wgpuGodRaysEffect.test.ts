import {
  applyGodRaysEffectToWgpu,
  defaultWgpuGodRaysEffectRunner,
  registerWgpuGodRaysEffect,
} from './wgpuGodRaysEffect';

describe('applyGodRaysEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuGodRaysEffectRunner).toBe('function');
  });
});

describe('registerWgpuGodRaysEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuGodRaysEffect).toBeTypeOf('function');
  });
});
