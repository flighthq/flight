import { createSprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { DisplayObject, Node2D, Texture } from '@flighthq/types/contract';

/**
 * What an imported node is still waiting on from elsewhere in the file.
 *
 * An image drawable names an asset by position and a nested artboard names another artboard, and both
 * are resolved after the whole file has been read — an artboard can nest one declared after it. The
 * marks are kept in side tables rather than on the node, because a display object carries no
 * knowledge of the format that produced it; the document layer reads them back to build resource
 * references and slots and nothing else ever sees them.
 */
export function createRiveImageSprite(name: string, assetIndex: number): DisplayObject {
  const texture = createTexture({ dimension: '2d', source: null });
  const sprite = createSprite({ data: { texture }, name });
  _imageTextures.set(sprite, texture);
  _imageAssetIndices.set(sprite, assetIndex);
  return sprite;
}

/** The asset position an image sprite waits on, or -1 for a node that is not one. */
export function getRiveImageAssetIndex(node: Readonly<Node2D>): number {
  return _imageAssetIndices.get(node) ?? RIVE_NO_INDEX;
}

/** The texture an image sprite will bind its decoded asset into, or null for a node that is not one. */
export function getRiveImageTexture(node: Readonly<Node2D>): Texture | null {
  return _imageTextures.get(node) ?? null;
}

/** The artboard a nested-artboard site names, or -1 for a node that is not one. */
export function getRiveNestedArtboardIndex(node: Readonly<Node2D>): number {
  return _nestedArtboards.get(node) ?? RIVE_NO_INDEX;
}

/**
 * Records a nested-artboard site so the document layer can turn it into a slot. Kept out of the node
 * itself: the display tree carries no knowledge of the format that produced it.
 */
export function markRiveNestedArtboard(node: Node2D, artboardIndex: number): void {
  _nestedArtboards.set(node, artboardIndex);
}

const RIVE_NO_INDEX = -1;

// Side tables rather than node fields: a display object stays ignorant of the format it came from.
const _nestedArtboards = new WeakMap<Readonly<Node2D>, number>();
const _imageTextures = new WeakMap<Readonly<Node2D>, Texture>();
const _imageAssetIndices = new WeakMap<Readonly<Node2D>, number>();
