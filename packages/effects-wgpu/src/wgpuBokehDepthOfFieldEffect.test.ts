import {
  applyBokehDepthOfFieldEffectToWgpu,
  defaultWgpuBokehDepthOfFieldEffectRunner,
  registerWgpuBokehDepthOfFieldEffect,
} from './wgpuBokehDepthOfFieldEffect';

describe('applyBokehDepthOfFieldEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBokehDepthOfFieldEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBokehDepthOfFieldEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBokehDepthOfFieldEffectRunner).toBe('function');
  });
});

describe('registerWgpuBokehDepthOfFieldEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuBokehDepthOfFieldEffect).toBeTypeOf('function');
  });
});
