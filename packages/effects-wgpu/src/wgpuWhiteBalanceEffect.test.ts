import { applyWhiteBalanceEffectToWgpu, defaultWgpuWhiteBalanceEffectRunner } from './wgpuWhiteBalanceEffect';

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
