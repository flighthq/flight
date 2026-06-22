import { applyChannelMixerEffectToWgpu, defaultWgpuChannelMixerEffectRunner } from './wgpuChannelMixerEffect';

describe('applyChannelMixerEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyChannelMixerEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuChannelMixerEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuChannelMixerEffectRunner).toBe('function');
  });
});
