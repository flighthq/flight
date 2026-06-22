import { applySsrEffectToWgpu, defaultWgpuSsrEffectRunner } from './wgpuSsrEffect';

describe('applySsrEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSsrEffectRunner).toBe('function');
  });
});
