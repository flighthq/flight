import {
  applyScanlinesEffectToWgpu,
  defaultWgpuScanlinesEffectRunner,
  registerWgpuScanlinesEffect,
} from './wgpuScanlinesEffect';

describe('applyScanlinesEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyScanlinesEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuScanlinesEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuScanlinesEffectRunner).toBe('function');
  });
});

describe('registerWgpuScanlinesEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuScanlinesEffect).toBeTypeOf('function');
  });
});
