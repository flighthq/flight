import { createSmaaEffect } from './smaaEffect';

describe('createSmaaEffect', () => {
  it('tags the intent type', () => {
    expect(createSmaaEffect().kind).toBe('SmaaEffect');
  });

  it('carries options', () => {
    expect(createSmaaEffect({ threshold: 0.1 })).toMatchObject({ threshold: 0.1 });
  });
});
