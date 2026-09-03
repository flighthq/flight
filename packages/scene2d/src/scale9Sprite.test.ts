import { getEntityRuntime } from '@flighthq/entity/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource, Scale9Sprite, SpriteRuntime } from '@flighthq/types/contract';
import { Scale9SpriteKind } from '@flighthq/types/contract';

import {
  createScale9Sprite,
  createScale9SpriteData,
  createScale9SpriteRuntime,
  getScale9SpriteRuntime,
} from './scale9Sprite';
import { computeSpriteLocalBoundsRectangle } from './sprite';

const grid = { height: 80, width: 80, x: 10, y: 10 };

describe('createScale9Sprite', () => {
  it('returns a sprite with the given scale9Grid on its data', () => {
    const sprite = createScale9Sprite(grid);
    expect(sprite.data.scale9Grid).toBe(grid);
  });

  it('initializes with a null texture', () => {
    const sprite = createScale9Sprite(grid);
    expect(sprite.data.texture).toBeNull();
  });

  it('has Scale9SpriteKind', () => {
    const sprite = createScale9Sprite(grid);
    expect(sprite.kind).toStrictEqual(Scale9SpriteKind);
  });

  it('allows a pre-defined texture', () => {
    const imageTexture = texture(64, 32);
    const sprite = createScale9Sprite(grid, { data: { texture: imageTexture } });
    expect(sprite.data.texture).toBe(imageTexture);
  });

  it('returns a new object each call', () => {
    expect(createScale9Sprite(grid)).not.toBe(createScale9Sprite(grid));
  });
});

describe('createScale9SpriteData', () => {
  it('stores the scale9Grid reference', () => {
    const data = createScale9SpriteData(grid);
    expect(data.scale9Grid).toBe(grid);
  });

  it('returns a null texture by default', () => {
    const data = createScale9SpriteData(grid);
    expect(data.texture).toBeNull();
  });

  it('uses provided texture when given', () => {
    const imageTexture = texture(10, 10);
    const data = createScale9SpriteData(grid, { texture: imageTexture });
    expect(data.texture).toBe(imageTexture);
  });
});

describe('createScale9SpriteRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createScale9SpriteRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeSpriteLocalBoundsRectangle', () => {
    expect(createScale9SpriteRuntime().computeLocalBoundsRectangle).toStrictEqual(computeSpriteLocalBoundsRectangle);
  });

  it('installs the texture-aware local-bounds validity hook', () => {
    const runtime = createScale9SpriteRuntime();
    expect(typeof runtime.isLocalBoundsRectangleValid).toBe('function');
    expect(runtime.localBoundsTexture).toBeNull();
    expect(runtime.localBoundsTextureVersion).toBe(-1);
  });
});

describe('getScale9SpriteRuntime', () => {
  it('returns the runtime for a Scale9Sprite', () => {
    const sprite = createScale9Sprite(grid);
    const runtime = getScale9SpriteRuntime(sprite);
    expect(runtime).not.toBeNull();
  });
});

describe('Scale9Sprite local bounds', () => {
  it('derives bounds from the texture like a plain Sprite', () => {
    const sprite = createScale9Sprite(grid, { data: { texture: texture(100, 50) } });
    expect(getNodeLocalBoundsRectangle(sprite)).toMatchObject({ height: 50, width: 100 });
  });

  it('refreshes bounds after bare texture assignment', () => {
    const sprite = createScale9Sprite(grid, { data: { texture: texture(16, 12) } });
    expect(getNodeLocalBoundsRectangle(sprite)).toMatchObject({ height: 12, width: 16 });
    const runtime = getEntityRuntime(sprite) as SpriteRuntime;
    const localBoundsId = runtime.localBoundsId;

    sprite.data.texture = texture(48, 30);

    expect(getNodeLocalBoundsRectangle(sprite)).toMatchObject({ height: 30, width: 48 });
    expect(runtime.localBoundsId).toBe(localBoundsId);
  });
});

function texture(width: number, height: number) {
  return createTexture({ dimension: '2d', source: { height, width } as ImageResource });
}
