import type { PartialWithData, Tilemap, TilemapData } from '@flighthq/types';

import { createPrimitive } from './createPrimitive';

export function createTilemap(obj: PartialWithData<Tilemap> = {}): Tilemap {
  return createPrimitive<Tilemap, TilemapData>('tilemap', obj, createTilemapData);
}

export function createTilemapData(data?: Partial<TilemapData>): TilemapData {
  return {
    smoothing: data?.smoothing ?? true,
    tileAlphaEnabled: data?.tileAlphaEnabled ?? true,
    tileBlendModeEnabled: data?.tileBlendModeEnabled ?? true,
    tileColorTransformEnabled: data?.tileColorTransformEnabled ?? true,
    tileset: data?.tileset ?? null,
  };
}
