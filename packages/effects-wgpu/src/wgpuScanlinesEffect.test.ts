import {
  applyScanlinesEffectToWgpu,
  wgpuScanlinesEffectRunner,
  registerWgpuScanlinesEffect,
} from './wgpuScanlinesEffect.ts';

describe('applyScanlinesEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyScanlinesEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuScanlinesEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuScanlinesEffect).toBeTypeOf('function');
  });
});

describe('wgpuScanlinesEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuScanlinesEffectRunner).toBe('function');
  });
});
