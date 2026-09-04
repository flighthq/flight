import { createSharpenEffect, initializeSharpenEffect } from './sharpenEffect';

describe('createSharpenEffect', () => {
  it('tags the intent type', () => {
    expect(createSharpenEffect().kind).toBe('SharpenEffect');
  });

  it('carries options', () => {
    expect(createSharpenEffect({ amount: 0.6 })).toMatchObject({ amount: 0.6 });
  });
});
describe('initializeSharpenEffect', () => {
  it('is the construction initializer of createSharpenEffect', () => {
    expect(typeof initializeSharpenEffect).toBe('function');
  });
});
