import {
  applyFilmGrainEffectToGl,
  defaultGlFilmGrainEffectRunner,
  registerGlFilmGrainEffect,
} from './glFilmGrainEffect';

describe('applyFilmGrainEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyFilmGrainEffectToGl).toBe('function');
  });
});

describe('defaultGlFilmGrainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlFilmGrainEffectRunner).toBe('function');
  });
});

describe('registerGlFilmGrainEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlFilmGrainEffect).toBeTypeOf('function');
  });
});
