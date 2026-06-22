import { createGodRaysEffect } from './godRaysEffect';

describe('createGodRaysEffect', () => {
  it('tags the intent type', () => {
    expect(createGodRaysEffect().kind).toBe('GodRaysEffect');
  });

  it('carries options', () => {
    expect(createGodRaysEffect({ centerX: 0.5, centerY: 0.25, density: 0.9 })).toMatchObject({
      centerX: 0.5,
      centerY: 0.25,
      density: 0.9,
    });
  });
});
