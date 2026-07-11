import { createDropShadowEffect } from './dropShadowEffect';

describe('createDropShadowEffect', () => {
  it('tags the intent type', () => {
    expect(createDropShadowEffect().kind).toBe('DropShadowEffect');
  });

  it('carries options', () => {
    expect(createDropShadowEffect({ strength: 2 })).toMatchObject({ strength: 2 });
  });
});
