import { createPosterizeEffect, initializePosterizeEffect } from './posterizeEffect';

describe('createPosterizeEffect', () => {
  it('tags the intent type', () => {
    expect(createPosterizeEffect().kind).toBe('PosterizeEffect');
  });

  it('carries options', () => {
    expect(createPosterizeEffect({ levels: 4 })).toMatchObject({ levels: 4 });
  });
});
describe('initializePosterizeEffect', () => {
  it('is the construction initializer of createPosterizeEffect', () => {
    expect(typeof initializePosterizeEffect).toBe('function');
  });
});
