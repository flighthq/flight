import type { Tileset } from '../../../assets';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface TilemapData extends DisplayObjectData {
  smoothing: boolean;
  tileAlphaEnabled: boolean;
  tileBlendModeEnabled: boolean;
  tileColorTransformEnabled: boolean;
  tileset: Tileset | null;
}

export interface Tilemap extends DisplayObject {
  data: TilemapData;
}

export const TilemapKind: unique symbol = Symbol('Tilemap');
