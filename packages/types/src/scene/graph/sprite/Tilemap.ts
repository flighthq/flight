import type { Tileset } from '../../../assets';
import type { SpriteBase } from './SpriteBase';

export interface Tilemap extends SpriteBase {
  tileset: Tileset;
  width: number;
  height: number;
}
