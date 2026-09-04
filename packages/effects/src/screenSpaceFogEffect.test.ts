import { createScreenSpaceFogEffect, initializeScreenSpaceFogEffect } from './screenSpaceFogEffect';

describe('createScreenSpaceFogEffect', () => {
  it('tags the intent type', () => {
    expect(createScreenSpaceFogEffect().kind).toBe('ScreenSpaceFogEffect');
  });

  it('carries options', () => {
    expect(createScreenSpaceFogEffect({ color: 0xaabbccff, density: 0.4 })).toMatchObject({
      color: 0xaabbccff,
      density: 0.4,
    });
  });
});
describe('initializeScreenSpaceFogEffect', () => {
  it('is the construction initializer of createScreenSpaceFogEffect', () => {
    expect(typeof initializeScreenSpaceFogEffect).toBe('function');
  });
});
