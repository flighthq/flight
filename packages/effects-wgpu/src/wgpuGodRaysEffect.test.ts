import { applyGodRaysEffectToWgpu, defaultWgpuGodRaysEffectRunner } from './wgpuGodRaysEffect';

describe('applyGodRaysEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuGodRaysEffectRunner).toBe('function');
  });
});
