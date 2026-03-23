import type { GraphNode, PartialNode, Rectangle, Sprite, SpriteData, SpriteNodeRuntime } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime } from './spriteBase';

export function computeSpriteLocalBoundsRect(_out: Rectangle, _source: Readonly<GraphNode>): void {
  // TODO: Get width/height from spritesheet reference
}

export function createSprite(obj?: Readonly<PartialNode<Sprite>>): Sprite {
  return createSpriteNode(SpriteKind, obj, createSpriteData, createSpriteRuntime as any) as Sprite; // eslint-disable-line
}

export function createSpriteData(data?: Readonly<Partial<SpriteData>>): SpriteData {
  return {
    id: data?.id ?? 0,
    rect: data?.rect ?? null,
    spritesheet: data?.spritesheet ?? null,
  };
}

export function createSpriteRuntime(): SpriteNodeRuntime {
  return createSpriteNodeRuntime(defaultMethods);
}

const defaultMethods: Partial<SpriteNodeRuntime> = {
  computeLocalBoundsRect: computeSpriteLocalBoundsRect,
};
