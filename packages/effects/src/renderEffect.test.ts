import { initializeRenderEffect } from './renderEffect';

describe('initializeRenderEffect', () => {
  it('is the construction initializer of createRenderEffect', () => {
    expect(typeof initializeRenderEffect).toBe('function');
  });
});
