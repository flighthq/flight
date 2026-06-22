import { applyCrtEffectToGl, defaultGlCrtEffectRunner } from './glCrtEffect';

describe('applyCrtEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCrtEffectToGl).toBe('function');
  });
});

describe('defaultGlCrtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlCrtEffectRunner).toBe('function');
  });
});
