import { applyFilmGrainEffectToCanvas, defaultCanvasFilmGrainEffectRunner } from './canvasFilmGrainEffect';

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
