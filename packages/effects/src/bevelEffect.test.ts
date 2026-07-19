import { createBevelEffect } from './bevelEffect';

describe('createBevelEffect', () => {
  it('tags the intent type', () => {
    expect(createBevelEffect().kind).toBe('BevelEffect');
  });

  it('carries options', () => {
    expect(createBevelEffect({ sourceMode: 'knockout', strength: 2 })).toMatchObject({
      sourceMode: 'knockout',
      strength: 2,
    });
  });
});
