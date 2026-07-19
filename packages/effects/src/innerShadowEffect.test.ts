import { createInnerShadowEffect } from './innerShadowEffect';

describe('createInnerShadowEffect', () => {
  it('tags the intent type', () => {
    expect(createInnerShadowEffect().kind).toBe('InnerShadowEffect');
  });

  it('carries options', () => {
    expect(createInnerShadowEffect({ strength: 2 })).toMatchObject({ strength: 2 });
  });

  it('carries object visibility flags', () => {
    expect(createInnerShadowEffect({ hideObject: true, knockout: true })).toMatchObject({
      hideObject: true,
      knockout: true,
    });
  });
});
