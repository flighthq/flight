import type { SpriteNode, SpriteNodeData } from './SpriteNode';
import type { Tileset } from './Tileset';

export interface TilemapData extends SpriteNodeData {
  tileset: Tileset | null;
  columns: number;
  rows: number;
  tiles: Int16Array;
}

export interface Tilemap extends SpriteNode {
  data: TilemapData;
}

export const TilemapKind: unique symbol = Symbol('Tilemap');
