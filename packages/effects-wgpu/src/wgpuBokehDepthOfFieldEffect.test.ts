import {
  applyBokehDepthOfFieldEffectToWgpu,
  defaultWgpuBokehDepthOfFieldEffectRunner,
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
