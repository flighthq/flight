import { applyBokehDepthOfFieldEffectToGl, defaultGlBokehDepthOfFieldEffectRunner } from './glBokehDepthOfFieldEffect';

describe('applyBokehDepthOfFieldEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBokehDepthOfFieldEffectToGl).toBe('function');
  });
});

describe('defaultGlBokehDepthOfFieldEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBokehDepthOfFieldEffectRunner).toBe('function');
  });
});
