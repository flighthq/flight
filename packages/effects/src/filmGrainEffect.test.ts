import { createFilmGrainEffect } from './filmGrainEffect';

describe('createFilmGrainEffect', () => {
  it('tags the intent type', () => {
    expect(createFilmGrainEffect().kind).toBe('FilmGrainEffect');
  });

  it('carries options', () => {
    expect(createFilmGrainEffect({ intensity: 0.3, size: 2, seed: 7 })).toMatchObject({
      intensity: 0.3,
      size: 2,
      seed: 7,
    });
  });
});
