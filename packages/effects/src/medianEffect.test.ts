import { createMedianEffect } from './medianEffect';

describe('createMedianEffect', () => {
  it('tags the intent type', () => {
    expect(createMedianEffect().kind).toBe('MedianEffect');
  });

  it('carries options', () => {
    expect(createMedianEffect({ radius: 2 })).toMatchObject({ radius: 2 });
  });
});
