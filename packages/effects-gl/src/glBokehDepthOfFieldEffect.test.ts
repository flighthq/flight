import {
  applyBokehDepthOfFieldEffectToGl,
  glBokehDepthOfFieldEffectRunner,
  registerGlBokehDepthOfFieldEffect,
} from './glBokehDepthOfFieldEffect';

describe('applyBokehDepthOfFieldEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBokehDepthOfFieldEffectToGl).toBe('function');
  });
});

describe('glBokehDepthOfFieldEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glBokehDepthOfFieldEffectRunner).toBe('function');
  });
});

describe('registerGlBokehDepthOfFieldEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlBokehDepthOfFieldEffect).toBeTypeOf('function');
  });
});
