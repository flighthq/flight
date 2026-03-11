import type { TextureAtlas } from './TextureAtlas';

export interface Tileset {
  atlas: TextureAtlas | null;
  columns: number;
  rows: number;
  tileHeight: number;
  tileWidth: number;
}
