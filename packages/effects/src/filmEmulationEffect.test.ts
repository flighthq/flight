import { createFilmEmulationEffect } from './filmEmulationEffect';

describe('createFilmEmulationEffect', () => {
  it('carries options', () => {
    expect(createFilmEmulationEffect({ grainIntensity: 0.2, halationStrength: 0.4 })).toMatchObject({
      grainIntensity: 0.2,
      halationStrength: 0.4,
    });
  });

  it('tags the intent type', () => {
    expect(createFilmEmulationEffect().kind).toBe('FilmEmulationEffect');
  });
});
