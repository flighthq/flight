import { createScanlinesEffect } from './scanlinesEffect';

describe('createScanlinesEffect', () => {
  it('tags the intent type', () => {
    expect(createScanlinesEffect().kind).toBe('ScanlinesEffect');
  });

  it('carries options', () => {
    expect(createScanlinesEffect({ count: 240, intensity: 0.4 })).toMatchObject({ count: 240, intensity: 0.4 });
  });
});
