import type { Entity } from './Entity';
import type { TextureAtlas } from './TextureAtlas';

export interface Tileset extends Entity {
  atlas: TextureAtlas | null;
  columns: number;
  margin: number;
  rows: number;
  spacing: number;
  tileHeight: number;
  tileWidth: number;
}
