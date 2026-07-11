import { createInnerGlowEffect } from './innerGlowEffect';

describe('createInnerGlowEffect', () => {
  it('tags the intent type', () => {
    expect(createInnerGlowEffect().kind).toBe('InnerGlowEffect');
  });

  it('carries options', () => {
    expect(createInnerGlowEffect({ strength: 2 })).toMatchObject({ strength: 2 });
  });
});
