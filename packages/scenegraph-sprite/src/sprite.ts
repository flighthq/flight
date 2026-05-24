import type { GraphNode, MethodsOf, PartialNode, Rectangle, Sprite, SpriteData, SpriteRuntime } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime, getSpriteNodeRuntime } from './spriteNode';

export function computeSpriteLocalBoundsRect(_out: Rectangle, _source: Readonly<GraphNode>): void {
  // TODO: Get width/height from spritesheet reference
}

export function createSprite(obj?: Readonly<PartialNode<Sprite>>): Sprite {
  return createSpriteNode(SpriteKind, obj, createSpriteData, createSpriteRuntime) as Sprite;
}

export function createSpriteData(data?: Readonly<Partial<SpriteData>>): SpriteData {
  return {
    atlas: data?.atlas ?? null,
    id: data?.id ?? 0,
    rect: data?.rect ?? null,
  };
}

export function createSpriteRuntime(): SpriteRuntime {
  return createSpriteNodeRuntime(defaultMethods) as SpriteRuntime;
}

export function getSpriteRuntime(source: Readonly<Sprite>): Readonly<SpriteRuntime> {
  return getSpriteNodeRuntime(source) as SpriteRuntime;
}

const defaultMethods: Partial<MethodsOf<SpriteRuntime>> = {
  computeLocalBoundsRect: computeSpriteLocalBoundsRect,
};
