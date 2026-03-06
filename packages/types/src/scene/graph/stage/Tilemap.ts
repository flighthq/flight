import type { Tileset } from '../../../assets';
import type { DisplayObject, PrimitiveData } from './DisplayObject';

export interface TilemapData extends PrimitiveData {
  smoothing: boolean;
  tileAlphaEnabled: boolean;
  tileBlendModeEnabled: boolean;
  tileColorTransformEnabled: boolean;
  tileset: Tileset | null;
}

export interface Tilemap extends DisplayObject {
  data: TilemapData;
}
