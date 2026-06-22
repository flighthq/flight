import { createScreenSpaceFogEffect } from './screenSpaceFogEffect';

describe('createScreenSpaceFogEffect', () => {
  it('tags the intent type', () => {
    expect(createScreenSpaceFogEffect().kind).toBe('ScreenSpaceFogEffect');
  });

  it('carries options', () => {
    expect(createScreenSpaceFogEffect({ color: 0xaabbccff, density: 0.4 })).toMatchObject({
      color: 0xaabbccff,
      density: 0.4,
    });
  });
});
