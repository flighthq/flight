import {
  applyBokehDepthOfFieldEffectToGl,
  defaultGlBokehDepthOfFieldEffectRunner,
  registerGlBokehDepthOfFieldEffect,
} from './glBokehDepthOfFieldEffect';

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

describe('registerGlBokehDepthOfFieldEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlBokehDepthOfFieldEffect).toBeTypeOf('function');
  });
});
