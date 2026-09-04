import { initializeModifier } from './modifier';

describe('initializeModifier', () => {
  it('is the construction initializer of createModifier', () => {
    expect(typeof initializeModifier).toBe('function');
  });
});
