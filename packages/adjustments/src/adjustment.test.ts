import { initializeAdjustment } from './adjustment.ts';

describe('initializeAdjustment', () => {
  it('is the construction initializer of createAdjustment', () => {
    expect(typeof initializeAdjustment).toBe('function');
  });
});
