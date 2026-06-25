import { createContactShadowsEffect } from './contactShadowsEffect';

describe('createContactShadowsEffect', () => {
  it('carries options', () => {
    expect(createContactShadowsEffect({ opacity: 0.8, samples: 32 })).toMatchObject({
      opacity: 0.8,
      samples: 32,
    });
  });

  it('tags the intent type', () => {
    expect(createContactShadowsEffect().kind).toBe('ContactShadowsEffect');
  });
});
