import type { PartialWithData, Tilemap, TilemapData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createTilemap(obj: PartialWithData<Tilemap> = {}): Tilemap {
  if (obj.data === undefined) obj.data = {} as TilemapData;
  if (obj.data.smoothing === undefined) obj.data.smoothing = true;
  if (obj.data.tileAlphaEnabled === undefined) obj.data.tileAlphaEnabled = true;
  if (obj.data.tileBlendModeEnabled === undefined) obj.data.tileBlendModeEnabled = true;
  if (obj.data.tileColorTransformEnabled === undefined) obj.data.tileColorTransformEnabled = true;
  if (obj.data.tileset === undefined) obj.data.tileset = null;
  if (obj.type === undefined) obj.type = 'tilemap';
  return createDisplayObject(obj) as Tilemap;
}
