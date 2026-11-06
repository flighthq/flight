import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { MaterialData } from '@flighthq/materials/contract';
import type { Node2D, Node2DData, Node2DRuntime } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { TextureAtlas } from '@flighthq/textureatlas/contract';

interface TilemapEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface TilemapData extends Node2DData {
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

export interface TilemapSignals extends TilemapEntity {
  onCleared: Signal<void>;
  onTileChanged: Signal<readonly [column: number, row: number, id: number]>;
  onTilesChanged: Signal<readonly [offsetColumn: number, offsetRow: number, width: number, height: number]>;
}

export const TilemapKind = 'Tilemap';
