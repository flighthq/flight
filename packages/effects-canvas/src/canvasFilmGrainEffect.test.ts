import {
  applyFilmGrainEffectToCanvas,
  defaultCanvasFilmGrainEffectRunner,
  registerCanvasFilmGrainEffect,
} from './canvasFilmGrainEffect';

describe('applyFilmGrainEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyFilmGrainEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasFilmGrainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasFilmGrainEffectRunner).toBe('function');
  });
});

describe('registerCanvasFilmGrainEffect', () => {
  it('is a function', () => expect(registerCanvasFilmGrainEffect).toBeTypeOf('function'));
});
