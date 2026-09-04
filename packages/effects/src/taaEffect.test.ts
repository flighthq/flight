import { createTaaEffect, initializeTaaEffect } from './taaEffect';

describe('createTaaEffect', () => {
  it('tags the intent type', () => {
    expect(createTaaEffect().kind).toBe('TaaEffect');
  });

  it('carries options', () => {
    expect(createTaaEffect({ feedback: 0.9 })).toMatchObject({ feedback: 0.9 });
  });
});
describe('initializeTaaEffect', () => {
  it('is the construction initializer of createTaaEffect', () => {
    expect(typeof initializeTaaEffect).toBe('function');
  });
});
