import { initializeAdjustment } from './adjustment';

describe('initializeAdjustment', () => {
  it('is the construction initializer of createAdjustment', () => {
    expect(typeof initializeAdjustment).toBe('function');
  });
});
