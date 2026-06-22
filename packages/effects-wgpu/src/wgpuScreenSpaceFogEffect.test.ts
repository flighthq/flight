import { applyScreenSpaceFogEffectToWgpu, defaultWgpuScreenSpaceFogEffectRunner } from './wgpuScreenSpaceFogEffect';

describe('applyScreenSpaceFogEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuScreenSpaceFogEffectRunner).toBe('function');
  });
});
