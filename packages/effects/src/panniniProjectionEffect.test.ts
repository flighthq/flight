import { createPanniniProjectionEffect } from './panniniProjectionEffect';

describe('createPanniniProjectionEffect', () => {
  it('carries options', () => {
    expect(createPanniniProjectionEffect({ compression: 0.7, crop: 0.1 })).toMatchObject({
      compression: 0.7,
      crop: 0.1,
    });
  });

  it('tags the intent type', () => {
    expect(createPanniniProjectionEffect().kind).toBe('PanniniProjectionEffect');
  });
});
