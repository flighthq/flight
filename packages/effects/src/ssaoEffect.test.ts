import { createSsaoEffect, initializeSsaoEffect } from './ssaoEffect';

describe('createSsaoEffect', () => {
  it('tags the intent type', () => {
    expect(createSsaoEffect().kind).toBe('SsaoEffect');
  });

  it('carries options', () => {
    expect(createSsaoEffect({ radius: 4, intensity: 1.5 })).toMatchObject({ radius: 4, intensity: 1.5 });
  });
});
describe('initializeSsaoEffect', () => {
  it('is the construction initializer of createSsaoEffect', () => {
    expect(typeof initializeSsaoEffect).toBe('function');
  });
});
