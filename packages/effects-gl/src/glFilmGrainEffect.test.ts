import { applyFilmGrainEffectToGl, defaultGlFilmGrainEffectRunner } from './glFilmGrainEffect';

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
