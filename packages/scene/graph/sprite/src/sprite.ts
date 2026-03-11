import type { Node, PartialNode, Rectangle, Sprite, SpriteBaseRuntime, SpriteData } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import { createSpriteBase, createSpriteBaseRuntime } from './spriteBase';

export function computeSpriteLocalBoundsRect(_out: Rectangle, _source: Readonly<Node>): void {
  // TODO: Get width/height from spritesheet reference
}

export function createSprite(obj?: Readonly<PartialNode<Sprite>>): Sprite {
  return createSpriteBase(SpriteKind, obj, createSpriteData, createSpriteRuntime as any) as Sprite; // eslint-disable-line
}

export function createSpriteData(data?: Readonly<Partial<SpriteData>>): SpriteData {
  return {
    id: data?.id ?? 0,
    rect: data?.rect ?? null,
    spritesheet: data?.spritesheet ?? null,
  };
}

export function createSpriteRuntime(): SpriteBaseRuntime {
  return createSpriteBaseRuntime(defaultMethods);
}

const defaultMethods: Partial<SpriteBaseRuntime> = {
  computeLocalBoundsRect: computeSpriteLocalBoundsRect,
};
