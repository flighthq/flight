import Sprite from './Sprite.js';

describe('create', () => {
  it('makes an instance of Sprite with default values', () => {
    const sprite = new Sprite();
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.x).toBe(0);
    expect(sprite.y).toBe(0);
  });
});
