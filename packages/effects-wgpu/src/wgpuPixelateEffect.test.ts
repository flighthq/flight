import { applyPixelateEffectToWgpu, defaultWgpuPixelateEffectRunner } from './wgpuPixelateEffect';

describe('applyPixelateEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuPixelateEffectRunner).toBe('function');
  });
});
