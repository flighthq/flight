import { createSmaaEffect, initializeSmaaEffect } from './smaaEffect';

describe('createSmaaEffect', () => {
  it('tags the intent type', () => {
    expect(createSmaaEffect().kind).toBe('SmaaEffect');
  });

  it('carries options', () => {
    expect(createSmaaEffect({ threshold: 0.1 })).toMatchObject({ threshold: 0.1 });
  });
});
describe('initializeSmaaEffect', () => {
  it('is the construction initializer of createSmaaEffect', () => {
    expect(typeof initializeSmaaEffect).toBe('function');
  });
});
