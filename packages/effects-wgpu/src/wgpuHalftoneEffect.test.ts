import {
  applyHalftoneEffectToWgpu,
  defaultWgpuHalftoneEffectRunner,
  registerWgpuHalftoneEffect,
} from './wgpuHalftoneEffect';

describe('applyHalftoneEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyHalftoneEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuHalftoneEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuHalftoneEffectRunner).toBe('function');
  });
});

describe('registerWgpuHalftoneEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuHalftoneEffect).toBeTypeOf('function');
  });
});
