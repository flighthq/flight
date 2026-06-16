import type { MaterialData } from './Material';
import type { SpriteNode, SpriteNodeData, SpriteNodeRuntime } from './SpriteNode';
import type { Tileset } from './Tileset';

export interface TilemapData extends SpriteNodeData {
  tileset: Tileset | null;
  columns: number;
  rows: number;
  tiles: Int16Array;
  // Per-tile material data, indexed by tile (row * columns + col). Null (or a null/absent element)
  // falls back to the node-level HasMaterial.materialData — see QuadBatchData.materialData.
  materialData: (MaterialData | null)[] | null;
}

export interface TilemapRuntime extends SpriteNodeRuntime {}

export interface Tilemap extends SpriteNode {
  data: TilemapData;
}

export const TilemapKind: unique symbol = Symbol('Tilemap');
