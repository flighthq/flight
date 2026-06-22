import { createGrayscaleEffect } from './grayscaleEffect';

describe('createGrayscaleEffect', () => {
  it('tags the intent type', () => {
    expect(createGrayscaleEffect().kind).toBe('GrayscaleEffect');
  });

  it('carries options', () => {
    expect(createGrayscaleEffect({ intensity: 0.5 })).toMatchObject({ intensity: 0.5 });
  });
});
