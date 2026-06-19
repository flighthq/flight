import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import type { MethodsOf, Node, PartialNode, Rectangle, Sprite, SpriteData, SpriteRuntime } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

export function computeSpriteLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
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
  return createDisplayObjectGeneric(SpriteKind, obj, createSpriteData, createSpriteRuntime) as Sprite;
}

export function createSpriteData(data?: Readonly<Partial<SpriteData>>): SpriteData {
  return {
    atlas: data?.atlas ?? null,
    id: data?.id ?? 0,
    rect: data?.rect ?? null,
  };
}

export function createSpriteRuntime(): SpriteRuntime {
  return createDisplayObjectRuntime(defaultMethods) as SpriteRuntime;
}

export function getSpriteRuntime(source: Readonly<Sprite>): Readonly<SpriteRuntime> {
  return getDisplayObjectRuntime(source) as SpriteRuntime;
}

const defaultMethods: Partial<MethodsOf<SpriteRuntime>> = {
  computeLocalBoundsRectangle: computeSpriteLocalBoundsRectangle,
};
