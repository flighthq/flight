import type { TiledObject } from './TiledObject';
import type { TiledProperty } from './TiledProperty';

// The Tiled layer family. This is a *closed* discriminated union on `type`: Tiled defines exactly
// these four layer kinds and users do not extend the format, so a fixed union (not an open kind
// registry) is the correct shape. Every variant shares `TiledLayerBase`; the codec projects tile
// layers into runtime `Tilemap`s and leaves object/image/group layers for the caller to map.

export interface TiledLayerBase {
  id: number;
  name: string;
  opacity: number;
  visible: boolean;
  offsetX: number;
  offsetY: number;
  properties: readonly TiledProperty[];
}

export interface TiledTileLayer extends TiledLayerBase {
  type: 'tilelayer';
  width: number;
  height: number;
  // Raw 32-bit GIDs in row-major order (`row * width + col`), flip bits intact, 0 = empty. Decode
  // each with `decodeTiledGid`. A compressed layer that could not be inflated (no `inflate` seam
  // supplied) is preserved as an all-zero grid, not dropped from the document.
  data: Uint32Array;
}

export interface TiledObjectGroup extends TiledLayerBase {
  type: 'objectgroup';
  objects: readonly TiledObject[];
}

export interface TiledImageLayer extends TiledLayerBase {
  type: 'imagelayer';
  image: string;
}

export interface TiledGroupLayer extends TiledLayerBase {
  type: 'group';
  layers: readonly TiledLayer[];
}

export type TiledLayer = TiledTileLayer | TiledObjectGroup | TiledImageLayer | TiledGroupLayer;
