import { applyCrtEffectToWgpu, defaultWgpuCrtEffectRunner } from './wgpuCrtEffect';

describe('applyCrtEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyCrtEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuCrtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuCrtEffectRunner).toBe('function');
  });
});
