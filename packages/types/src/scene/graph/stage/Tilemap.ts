import type { DisplayObject } from './DisplayObject';
import type { TilemapData } from './TilemapData';

export interface Tilemap extends DisplayObject {
  data: TilemapData;
}
