import { createBevelEffect } from './bevelEffect';

describe('createBevelEffect', () => {
  it('tags the intent type', () => {
    expect(createBevelEffect().kind).toBe('BevelEffect');
  });

  it('carries options', () => {
    expect(createBevelEffect({ strength: 2 })).toMatchObject({ strength: 2 });
  });
});
