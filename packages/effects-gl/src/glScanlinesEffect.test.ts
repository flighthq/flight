import { applyScanlinesEffectToGl, defaultGlScanlinesEffectRunner } from './glScanlinesEffect';

describe('applyScanlinesEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyScanlinesEffectToGl).toBe('function');
  });
});

describe('defaultGlScanlinesEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlScanlinesEffectRunner).toBe('function');
  });
});
