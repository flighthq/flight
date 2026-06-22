import { applyChannelMixerEffectToCanvas, defaultCanvasChannelMixerEffectRunner } from './canvasChannelMixerEffect';

describe('applyChannelMixerEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyChannelMixerEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasChannelMixerEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasChannelMixerEffectRunner).toBe('function');
  });
});
