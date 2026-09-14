import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { Node2D, Sprite, Texture2D } from '@flighthq/types/contract';

import {
  createRiveImageSprite,
  getRiveImageAssetIndex,
  getRiveImageTexture,
  getRiveNestedArtboardIndex,
  markRiveNestedArtboard,
} from './riveAssetBinding';

// Both marks are side data. A display object gains no field for either, which is what keeps the tree
// ignorant of the format that produced it.

describe('createRiveImageSprite', () => {
  it('stands up a sprite whose texture has no source until a resource resolves', () => {
    const sprite = createRiveImageSprite('logo', 0) as Sprite;

    expect(sprite.name).toBe('logo');
    // The texture exists but carries no pixels until a resource reference resolves into it.
    const texture = sprite.data.texture as Texture2D;
    expect(texture.dimension).toBe('2d');
    expect(texture.source).toBeNull();
  });

  it('gives each sprite its own texture, so one asset can bind many placements', () => {
    const first = createRiveImageSprite('logo', 2);
    const second = createRiveImageSprite('logo', 2);

    expect(getRiveImageTexture(first)).not.toBe(getRiveImageTexture(second));
    expect(getRiveImageAssetIndex(second)).toBe(2);
  });
});

describe('getRiveImageAssetIndex', () => {
  it('reports the asset position the sprite waits on', () => {
    expect(getRiveImageAssetIndex(createRiveImageSprite('logo', 3))).toBe(3);
  });

  it('reports -1 for a node that is not an image sprite', () => {
    expect(getRiveImageAssetIndex(createDisplayObject({}))).toBe(-1);
  });
});

describe('getRiveImageTexture', () => {
  it('returns the texture the decoded asset will bind into', () => {
    expect(getRiveImageTexture(createRiveImageSprite('logo', 0))).not.toBeNull();
  });

  it('returns null for a node that is not an image sprite', () => {
    expect(getRiveImageTexture(createDisplayObject({}))).toBeNull();
  });
});

describe('getRiveNestedArtboardIndex', () => {
  it('returns the artboard a marked site names', () => {
    const node: Node2D = createDisplayObject({});
    markRiveNestedArtboard(node, 4);

    expect(getRiveNestedArtboardIndex(node)).toBe(4);
  });

  it('returns -1 for a node that names no nested artboard', () => {
    expect(getRiveNestedArtboardIndex(createDisplayObject({}))).toBe(-1);
  });

  it('separates a nested-artboard site from an image sprite', () => {
    const sprite = createRiveImageSprite('logo', 0);

    expect(getRiveNestedArtboardIndex(sprite)).toBe(-1);
  });
});

describe('markRiveNestedArtboard', () => {
  it('records a slot site without putting format knowledge on the node', () => {
    const node: Node2D = createDisplayObject({});
    markRiveNestedArtboard(node, 0);

    // The mark is side data; the node itself gains no field.
    expect(Object.keys(node)).not.toContain('nestedArtboard');
    expect(getRiveNestedArtboardIndex(node)).toBe(0);
  });

  it('replaces an earlier mark rather than keeping both', () => {
    const node: Node2D = createDisplayObject({});
    markRiveNestedArtboard(node, 1);
    markRiveNestedArtboard(node, 2);

    expect(getRiveNestedArtboardIndex(node)).toBe(2);
  });
});
