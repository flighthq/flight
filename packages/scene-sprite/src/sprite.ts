import type { MethodsOf, PartialNode, Rectangle, SceneNode, Sprite, SpriteData, SpriteRuntime } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime, getSpriteNodeRuntime } from './spriteNode';

export function computeSpriteLocalBoundsRectangle(out: Rectangle, source: Readonly<SceneNode>): void {
  const data = (source as Sprite).data;
  if (data.rect !== null) {
    out.width = data.rect.width;
    out.height = data.rect.height;
    return;
  }
  if (data.atlas !== null) {
    const region = data.atlas.regions.find((r) => r.id === data.id);
    if (region !== undefined) {
      out.width = region.width;
      out.height = region.height;
    }
  }
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
  computeLocalBoundsRect: computeSpriteLocalBoundsRectangle,
};
