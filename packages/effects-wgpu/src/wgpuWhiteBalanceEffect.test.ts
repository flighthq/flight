import {
  applyWhiteBalanceEffectToWgpu,
  defaultWgpuWhiteBalanceEffectRunner,
  registerWgpuWhiteBalanceEffect,
} from './wgpuWhiteBalanceEffect';

describe('applyWhiteBalanceEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyWhiteBalanceEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuWhiteBalanceEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuWhiteBalanceEffectRunner).toBe('function');
  });
});

describe('registerWgpuWhiteBalanceEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuWhiteBalanceEffect).toBeTypeOf('function');
  });
});
