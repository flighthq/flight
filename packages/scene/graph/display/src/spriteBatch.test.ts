import type { Sprite, SpriteBatch } from '@flighthq/types';
import { SpriteBatchKind } from '@flighthq/types';

import { createSpriteBatch } from './spriteBatch';

describe('createTilemap', () => {
  let spriteBatch: SpriteBatch;

  beforeEach(() => {
    spriteBatch = createSpriteBatch();
  });

  it('initializes default values', () => {
    expect(spriteBatch.data.batch).toBeNull();
    expect(spriteBatch.data.smoothing).toBe(true);
    expect(spriteBatch.kind).toStrictEqual(SpriteBatchKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        batch: {} as Sprite,
        smoothing: false,
      },
    };
    const obj = createSpriteBatch(base);
    expect(obj.data.batch).toStrictEqual(base.data.batch);
    expect(obj.data.smoothing).toStrictEqual(base.data.smoothing);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSpriteBatch(base);
    expect(obj).not.toStrictEqual(base);
  });
});
