import { createInvertEffect } from './invertEffect';

describe('createInvertEffect', () => {
  it('tags the intent type', () => {
    expect(createInvertEffect().kind).toBe('InvertEffect');
  });

  it('carries options', () => {
    expect(createInvertEffect({ intensity: 0.75 })).toMatchObject({ intensity: 0.75 });
  });
});
