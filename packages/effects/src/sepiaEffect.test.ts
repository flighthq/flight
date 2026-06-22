import { createSepiaEffect } from './sepiaEffect';

describe('createSepiaEffect', () => {
  it('tags the intent type', () => {
    expect(createSepiaEffect().kind).toBe('SepiaEffect');
  });

  it('carries options', () => {
    expect(createSepiaEffect({ intensity: 0.6 })).toMatchObject({ intensity: 0.6 });
  });
});
