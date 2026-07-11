import { createOuterGlowEffect } from './outerGlowEffect';

describe('createOuterGlowEffect', () => {
  it('tags the intent type', () => {
    expect(createOuterGlowEffect().kind).toBe('OuterGlowEffect');
  });

  it('carries options', () => {
    expect(createOuterGlowEffect({ strength: 2 })).toMatchObject({ strength: 2 });
  });
});
