import { createPosterizeEffect } from './posterizeEffect';

describe('createPosterizeEffect', () => {
  it('tags the intent type', () => {
    expect(createPosterizeEffect().kind).toBe('PosterizeEffect');
  });

  it('carries options', () => {
    expect(createPosterizeEffect({ levels: 4 })).toMatchObject({ levels: 4 });
  });
});
