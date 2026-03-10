import type { Tileset } from '../../../assets';
import type { SpriteBase, SpriteBaseData } from './SpriteBase';

export interface TilemapData extends SpriteBaseData {
  tileset: Tileset | null;
  width: number;
  height: number;
}

export interface Tilemap extends SpriteBase {
  data: TilemapData;
}

export const TilemapKind: unique symbol = Symbol('Tilemap');
