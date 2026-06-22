import { applyHueSaturationEffectToWgpu, defaultWgpuHueSaturationEffectRunner } from './wgpuHueSaturationEffect';

describe('applyHueSaturationEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyHueSaturationEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuHueSaturationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuHueSaturationEffectRunner).toBe('function');
  });
});
