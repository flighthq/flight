import { createScanlinesEffect, initializeScanlinesEffect } from './scanlinesEffect';

describe('createScanlinesEffect', () => {
  it('tags the intent type', () => {
    expect(createScanlinesEffect().kind).toBe('ScanlinesEffect');
  });

  it('carries options', () => {
    expect(createScanlinesEffect({ count: 240, intensity: 0.4 })).toMatchObject({ count: 240, intensity: 0.4 });
  });
});
describe('initializeScanlinesEffect', () => {
  it('is the construction initializer of createScanlinesEffect', () => {
    expect(typeof initializeScanlinesEffect).toBe('function');
  });
});
