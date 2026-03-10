import type {
  GraphNode,
  HasBoundsRect,
  PartialWithData,
  Rectangle,
  SpriteBaseRuntime,
  SpriteGraph,
  Tilemap,
  TilemapData,
} from '@flighthq/types';
import { TilemapKind } from '@flighthq/types';

import { createSpriteBase, createSpriteBaseRuntime } from './spriteBase';

export function computeTilemapLocalBoundsRect(
  _out: Rectangle,
  _source: Readonly<GraphNode<typeof SpriteGraph> & HasBoundsRect<typeof SpriteGraph>>,
): void {
  // TODO: Get width/height from tileset reference
}

export function createTilemap(obj?: Readonly<PartialWithData<Tilemap>>): Tilemap {
  return createSpriteBase(TilemapKind, obj, createTilemapData, createTilemapRuntime) as Tilemap;
}

export function createTilemapData(data?: Readonly<Partial<TilemapData>>): TilemapData {
  return {
    height: data?.height ?? 0,
    tileset: data?.tileset ?? null,
    width: data?.width ?? 0,
  };
}

export function createTilemapRuntime(): SpriteBaseRuntime {
  return createSpriteBaseRuntime(defaultMethods);
}

const defaultMethods: Partial<SpriteBaseRuntime> = {
  computeLocalBoundsRect: computeTilemapLocalBoundsRect,
};
