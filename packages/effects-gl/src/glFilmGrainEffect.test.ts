import { applyFilmGrainEffectToGl, glFilmGrainEffectRunner, registerGlFilmGrainEffect } from './glFilmGrainEffect';

describe('applyFilmGrainEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyFilmGrainEffectToGl).toBe('function');
  });
});

describe('glFilmGrainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glFilmGrainEffectRunner).toBe('function');
  });
});

describe('registerGlFilmGrainEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlFilmGrainEffect).toBeTypeOf('function');
  });
});
