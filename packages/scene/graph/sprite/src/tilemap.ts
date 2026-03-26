import type { GraphNode, PartialNode, Rectangle, SpriteNodeRuntime, Tilemap, TilemapData } from '@flighthq/types';
import { TilemapKind } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime } from './spriteNode';

export function computeTilemapLocalBoundsRect(_out: Rectangle, _source: Readonly<GraphNode>): void {
  // TODO: Get width/height from tileset reference
}

export function createTilemap(obj?: Readonly<PartialNode<Tilemap>>): Tilemap {
  return createSpriteNode(TilemapKind, obj, createTilemapData, createTilemapRuntime as any) as Tilemap; // eslint-disable-line
}

export function createTilemapData(data?: Readonly<Partial<TilemapData>>): TilemapData {
  return {
    height: data?.height ?? 0,
    tileset: data?.tileset ?? null,
    width: data?.width ?? 0,
  };
}

export function createTilemapRuntime(): SpriteNodeRuntime {
  return createSpriteNodeRuntime(defaultMethods);
}

const defaultMethods: Partial<SpriteNodeRuntime> = {
  computeLocalBoundsRect: computeTilemapLocalBoundsRect,
};
