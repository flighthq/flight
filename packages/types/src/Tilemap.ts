import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { MaterialData } from './Material';
import type { Tileset } from './Tileset';

export interface TilemapData extends DisplayObjectData {
  tileset: Tileset | null;
  columns: number;
  rows: number;
  tiles: Int16Array;
  // Per-tile material data, indexed by tile (row * columns + col). Null (or a null/absent element)
  // falls back to the node-level HasMaterial.materialData — see QuadBatchData.materialData.
  materialData: (MaterialData | null)[] | null;
}

export interface TilemapRuntime extends DisplayObjectRuntime {}

export interface Tilemap extends DisplayObject {
  data: TilemapData;
}

export const TilemapKind = 'Tilemap';
