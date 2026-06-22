import { applySmaaEffectToWgpu, defaultWgpuSmaaEffectRunner } from './wgpuSmaaEffect';

describe('applySmaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSmaaEffectRunner).toBe('function');
  });
});
