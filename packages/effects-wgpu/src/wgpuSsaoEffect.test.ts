import { applySsaoEffectToWgpu, defaultWgpuSsaoEffectRunner } from './wgpuSsaoEffect';

describe('applySsaoEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSsaoEffectRunner).toBe('function');
  });
});
