import {
  applyLensDirtEffectToWgpu,
  defaultWgpuLensDirtEffectRunner,
  registerWgpuLensDirtEffect,
} from './wgpuLensDirtEffect';

describe('applyLensDirtEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuLensDirtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuLensDirtEffectRunner).toBe('function');
  });
});

describe('registerWgpuLensDirtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuLensDirtEffect).toBeTypeOf('function');
  });
});
