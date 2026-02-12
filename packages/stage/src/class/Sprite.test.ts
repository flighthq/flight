import Sprite from './Sprite.js';

describe('Sprite', () => {
  // Constructor

  it('can be instantiated', () => {
    const sprite = new Sprite();
    expect(sprite).toBeInstanceOf(Sprite);
  });
});
