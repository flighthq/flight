import { getEntityRuntime } from '@flighthq/entity/contract';
import { createRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';
import type { ImageResource, Node, Sprite, SpriteRuntime } from '@flighthq/types/contract';
import { SpriteKind } from '@flighthq/types/contract';

import {
  cloneSprite,
  computeSpriteLocalBoundsRectangle,
  createSprite,
  createSpriteData,
  createSpriteRendererData,
  createSpriteRuntime,
  getSpriteRuntime,
  initializeSpriteData,
  initializeSpriteRendererData,
  isSpriteRendererDirty,
} from './sprite';

describe('cloneSprite', () => {
  it('shares the texture through a fresh sprite', () => {
    const source = createSprite({ data: { texture: texture(10, 20) } });
    const copy = cloneSprite(source);
    expect(copy).not.toBe(source);
    expect(copy.data.texture).toBe(source.data.texture);
  });
});

describe('computeSpriteLocalBoundsRectangle', () => {
  it('uses texture dimensions multiplied by its uv window', () => {
    const imageTexture = texture(100, 200);
    setTextureUvFromPixelRect(imageTexture, 10, 20, 30, 40);
    const sprite = createSprite({ data: { texture: imageTexture } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.width).toBe(30);
    expect(out.height).toBe(40);
  });

  it('sets an empty size when texture is null', () => {
    const sprite = createSprite();
    const out = createRectangle(0, 0, 50, 60);
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as Node);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });
});

describe('createSprite', () => {
  let sprite: Sprite;

  beforeEach(() => {
    sprite = createSprite();
  });

  it('initializes default values', () => {
    expect(sprite.data.texture).toBeNull();
    expect(sprite.kind).toBe(SpriteKind);
  });

  it('allows pre-defined values', () => {
    const imageTexture = texture(10, 10);
    const obj = createSprite({ data: { texture: imageTexture } });
    expect(obj.data.texture).toBe(imageTexture);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSprite(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createSpriteData', () => {
  it('returns default values', () => {
    expect(createSpriteData().texture).toBeNull();
  });

  it('allows pre-defined values', () => {
    const imageTexture = texture(10, 10);
    expect(createSpriteData({ texture: imageTexture }).texture).toBe(imageTexture);
  });
});

describe('createSpriteRendererData', () => {
  it('creates a clean per-state stamp for the current texture', () => {
    const sprite = createSprite({ data: { texture: texture(16, 16) } });
    const data = createSpriteRendererData({} as never, sprite);

    expect(isSpriteRendererDirty({} as never, sprite, data)).toBe(false);
  });
});

describe('createSpriteRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createSpriteRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeSpriteLocalBoundsRectangle', () => {
    expect(createSpriteRuntime().computeLocalBoundsRectangle).toStrictEqual(computeSpriteLocalBoundsRectangle);
  });

  it('installs the texture-aware local-bounds validity hook', () => {
    const runtime = createSpriteRuntime();
    expect(typeof runtime.isLocalBoundsRectangleValid).toBe('function');
    expect(runtime.localBoundsTexture).toBeNull();
    expect(runtime.localBoundsTextureVersion).toBe(-1);
  });
});

describe('getSpriteRuntime', () => {
  it('returns the runtime of the given Sprite', () => {
    expect(getSpriteRuntime(createSprite())).not.toBeNull();
  });
});

describe('initializeSpriteData', () => {
  it('is the construction initializer of createSpriteData', () => {
    expect(typeof initializeSpriteData).toBe('function');
  });
});

describe('initializeSpriteRendererData', () => {
  it('is the construction initializer of createSpriteRendererData', () => {
    expect(typeof initializeSpriteRendererData).toBe('function');
  });
});

function texture(width: number, height: number) {
  return createTexture({ dimension: '2d', source: { height, width } as ImageResource });
}
describe('isSpriteRendererDirty', () => {
  it('detects same-size bare texture assignment once without node invalidation', () => {
    const sprite = createSprite({ data: { texture: texture(64, 64) } });
    const data = createSpriteRendererData({} as never, sprite);
    const runtime = getEntityRuntime(sprite) as SpriteRuntime;
    const contentId = runtime.localContentId;

    sprite.data.texture = texture(64, 64);

    expect(isSpriteRendererDirty({} as never, sprite, data)).toBe(true);
    expect(isSpriteRendererDirty({} as never, sprite, data)).toBe(false);
    expect(runtime.localContentId).toBe(contentId);
  });

  it('detects a version bump on the same texture identity', () => {
    const sprite = createSprite({ data: { texture: texture(64, 64) } });
    const data = createSpriteRendererData({} as never, sprite);
    sprite.data.texture!.version++;

    expect(isSpriteRendererDirty({} as never, sprite, data)).toBe(true);
  });
});

describe('Sprite local bounds validity', () => {
  it('refreshes bounds after bare texture assignment without changing localBoundsId', () => {
    const sprite = createSprite({ data: { texture: texture(16, 12) } });
    expect(getNodeLocalBoundsRectangle(sprite)).toMatchObject({ width: 16, height: 12 });
    const runtime = getEntityRuntime(sprite) as SpriteRuntime;
    const localBoundsId = runtime.localBoundsId;

    sprite.data.texture = texture(48, 30);

    expect(getNodeLocalBoundsRectangle(sprite)).toMatchObject({ width: 48, height: 30 });
    expect(runtime.localBoundsId).toBe(localBoundsId);
  });
});
