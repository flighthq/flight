import { applyHalftoneEffectToGl, defaultGlHalftoneEffectRunner } from './glHalftoneEffect';

describe('applyHalftoneEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyHalftoneEffectToGl).toBe('function');
  });
});

describe('defaultGlHalftoneEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlHalftoneEffectRunner).toBe('function');
  });
});
