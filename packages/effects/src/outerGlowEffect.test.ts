import { createOuterGlowEffect } from './outerGlowEffect';

describe('createOuterGlowEffect', () => {
  it('tags the intent type', () => {
    expect(createOuterGlowEffect().kind).toBe('OuterGlowEffect');
  });

  it('carries options', () => {
    expect(createOuterGlowEffect({ sourceMode: 'hide', strength: 2 })).toMatchObject({
      sourceMode: 'hide',
      strength: 2,
    });
  });
});
