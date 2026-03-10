import type { Rectangle, Sprite, Spritesheet } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import { createSprite } from './sprite';

describe('createSprite', () => {
  let sprite: Sprite;

  beforeEach(() => {
    sprite = createSprite();
  });

  it('initializes default values', () => {
    expect(sprite.data.id).toBe(0);
    expect(sprite.data.rect).toBeNull();
    expect(sprite.data.spritesheet).toBeNull();
    expect(sprite.kind).toBe(SpriteKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        id: 1,
        rect: {} as Rectangle,
        spritesheet: {} as Spritesheet,
      },
    };
    const obj = createSprite(base);
    expect(obj.data.id).toStrictEqual(base.data.id);
    expect(obj.data.rect).toStrictEqual(base.data.rect);
    expect(obj.data.spritesheet).toStrictEqual(base.data.spritesheet);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSprite(base);
    expect(obj).not.toStrictEqual(base);
  });
});
