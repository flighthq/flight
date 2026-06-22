import { applyScanlinesEffectToWgpu, defaultWgpuScanlinesEffectRunner } from './wgpuScanlinesEffect';

describe('applyScanlinesEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyScanlinesEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuScanlinesEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuScanlinesEffectRunner).toBe('function');
  });
});
