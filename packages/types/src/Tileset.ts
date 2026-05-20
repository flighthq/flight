import type { Entity } from './Entity';
import type { TextureAtlas } from './TextureAtlas';

export interface Tileset extends Entity {
  atlas: TextureAtlas | null;
  columns: number;
  rows: number;
  tileHeight: number;
  tileWidth: number;
}
