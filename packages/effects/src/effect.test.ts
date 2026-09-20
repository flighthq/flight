import { initializeEffect } from './effect';

describe('initializeEffect', () => {
  it('is the construction initializer used by effect factories', () => {
    expect(typeof initializeEffect).toBe('function');
  });
});
