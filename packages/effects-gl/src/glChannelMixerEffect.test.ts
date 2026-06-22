import { applyChannelMixerEffectToGl, defaultGlChannelMixerEffectRunner } from './glChannelMixerEffect';

describe('applyChannelMixerEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyChannelMixerEffectToGl).toBe('function');
  });
});

describe('defaultGlChannelMixerEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlChannelMixerEffectRunner).toBe('function');
  });
});
