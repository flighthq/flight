import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node/contract';
import { getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  Sprite,
  SpriteData,
  SpriteRuntime,
} from '@flighthq/types/contract';
import { SpriteKind } from '@flighthq/types/contract';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject';

export function cloneSprite(source: Readonly<Sprite>): Sprite {
  return createSprite({ data: { texture: source.data.texture } });
}

export function computeSpriteLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const texture = (source.data as SpriteData).texture;
  out.width = texture === null ? 0 : Math.max(0, getTextureWidth(texture)) * Math.abs(texture.uvScale.x);
  out.height = texture === null ? 0 : Math.max(0, getTextureHeight(texture)) * Math.abs(texture.uvScale.y);
}

export function createSprite(obj?: Readonly<PartialNode<Sprite>>): Sprite {
  return createNode2D(SpriteKind, obj, createSpriteData, createSpriteRuntime) as Sprite;
}

export function createSpriteData(data?: Readonly<Partial<SpriteData>>): SpriteData {
  return {
    texture: data?.texture ?? null,
  };
}

export function createSpriteRuntime(): SpriteRuntime {
  return createNode2DRuntime(defaultMethods) as SpriteRuntime;
}

export function getSpriteRuntime(source: Readonly<Sprite>): Readonly<SpriteRuntime> {
  return getNode2DRuntime(source) as SpriteRuntime;
}

export function setSpriteTexture(source: Sprite, value: SpriteData['texture']): void {
  source.data.texture = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<SpriteRuntime>> = {
  computeLocalBoundsRectangle: computeSpriteLocalBoundsRectangle,
};
