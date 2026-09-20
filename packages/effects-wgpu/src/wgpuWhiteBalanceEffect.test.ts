import {
  applyWhiteBalanceEffectToWgpu,
  wgpuWhiteBalanceEffectRunner,
  registerWgpuWhiteBalanceEffect,
} from './wgpuWhiteBalanceEffect';

describe('applyWhiteBalanceEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyWhiteBalanceEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuWhiteBalanceEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuWhiteBalanceEffect).toBeTypeOf('function');
  });
});

describe('wgpuWhiteBalanceEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuWhiteBalanceEffectRunner).toBe('function');
  });
});
