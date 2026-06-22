import { applyHalftoneEffectToWgpu, defaultWgpuHalftoneEffectRunner } from './wgpuHalftoneEffect';

describe('applyHalftoneEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyHalftoneEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuHalftoneEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuHalftoneEffectRunner).toBe('function');
  });
});
