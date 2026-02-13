import { createSprite } from './createSprite';

describe('createSprite', () => {
  it('can be instantiated', () => {
    const sprite = createSprite();
    expect(sprite).not.toBeNull();
  });
});
