import { getEntityRuntime } from '@flighthq/entity/contract';
import { createRectangle } from '@flighthq/geometry/contract';
import { createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';
import type { ImageResource, Node, Sprite, SpriteRuntime } from '@flighthq/types/contract';
import { SpriteKind } from '@flighthq/types/contract';

import {
  cloneSprite,
  computeSpriteLocalBoundsRectangle,
  createSprite,
  createSpriteData,
  createSpriteRuntime,
  getSpriteRuntime,
  setSpriteTexture,
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

describe('createSpriteRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createSpriteRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeSpriteLocalBoundsRectangle', () => {
    expect(createSpriteRuntime().computeLocalBoundsRectangle).toStrictEqual(computeSpriteLocalBoundsRectangle);
  });
});

describe('getSpriteRuntime', () => {
  it('returns the runtime of the given Sprite', () => {
    expect(getSpriteRuntime(createSprite())).not.toBeNull();
  });
});

describe('setSpriteTexture', () => {
  it('sets the texture', () => {
    const sprite = createSprite();
    const imageTexture = texture(64, 64);
    setSpriteTexture(sprite, imageTexture);
    expect(sprite.data.texture).toBe(imageTexture);
  });

  it('accepts null', () => {
    const sprite = createSprite({ data: { texture: texture(1, 1) } });
    setSpriteTexture(sprite, null);
    expect(sprite.data.texture).toBeNull();
  });

  it('invalidates local bounds', () => {
    const sprite = createSprite();
    const runtime = getEntityRuntime(sprite) as SpriteRuntime;
    const idBefore = runtime.localBoundsId;
    setSpriteTexture(sprite, texture(64, 64));
    expect(runtime.localBoundsId).not.toBe(idBefore);
  });

  it('invalidates local content', () => {
    const sprite = createSprite();
    const runtime = getEntityRuntime(sprite) as SpriteRuntime;
    const idBefore = runtime.localContentId;
    setSpriteTexture(sprite, texture(64, 64));
    expect(runtime.localContentId).not.toBe(idBefore);
  });
});

function texture(width: number, height: number) {
  return createTexture({ storage: { dimension: '2d', image: { height, width } as ImageResource } });
}
