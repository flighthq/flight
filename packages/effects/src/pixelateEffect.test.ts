import { createPixelateEffect } from './pixelateEffect';

describe('createPixelateEffect', () => {
  it('tags the intent type', () => {
    expect(createPixelateEffect().kind).toBe('PixelateEffect');
  });

  it('carries options', () => {
    expect(createPixelateEffect({ size: 8 })).toMatchObject({ size: 8 });
  });
});
