import {
  applyFilmGrainEffectToCanvas,
  canvasFilmGrainEffectRunner,
  registerCanvasFilmGrainEffect,
} from './canvasFilmGrainEffect';

describe('applyFilmGrainEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyFilmGrainEffectToCanvas).toBe('function');
  });
});

describe('canvasFilmGrainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof canvasFilmGrainEffectRunner).toBe('function');
  });
});

describe('registerCanvasFilmGrainEffect', () => {
  it('is a function', () => expect(registerCanvasFilmGrainEffect).toBeTypeOf('function'));
});
