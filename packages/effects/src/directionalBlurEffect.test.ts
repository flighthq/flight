import { createDirectionalBlurEffect } from './directionalBlurEffect';

describe('createDirectionalBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createDirectionalBlurEffect().kind).toBe('DirectionalBlurEffect');
  });

  it('carries options', () => {
    expect(createDirectionalBlurEffect({ angle: 1, length: 8 })).toMatchObject({ angle: 1, length: 8 });
  });
});
