import { applyBloomEffectToWgpu, defaultWgpuBloomEffectRunner } from './wgpuBloomEffect';

describe('applyBloomEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBloomEffectRunner).toBe('function');
  });
});
