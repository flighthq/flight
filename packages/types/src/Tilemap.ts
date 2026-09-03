import type { Entity } from './Entity';
import type { MaterialData } from './Material';
import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { TextureAtlas } from './TextureAtlas';

export interface TilemapData extends Node2DData, Entity {
  atlas: TextureAtlas | null;
  columns: number;
  rows: number;
  tileHeight: number;
  tileWidth: number;
  tiles: Int16Array;
  // Per-tile material data, indexed by tile (row * columns + col). Null (or a null/absent element)
  // falls back to the node-level HasMaterial.materialData — see QuadBatchData.materialData.
  materialData: (MaterialData | null)[] | null;
}

export interface TilemapRuntime extends Node2DRuntime {}

export interface Tilemap extends Node2D {
  data: TilemapData;
}

export const TilemapKind = 'Tilemap';
