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
  // Packed RGBA (e.g. `0xff8800ff`) multiplied into everything the layer draws, or null when the layer
  // declares no tint — which is not the same as white, because a document that omits the attribute
  // must re-emit without one.
  tintColor: number | null;
  // Parallax scroll factors. 1 is lockstep with the camera, which is what an absent attribute means, so
  // these default to 1 rather than 0.
  parallaxX: number;
  parallaxY: number;
  // The layer's user-assigned class string, empty when unset. Tiled 1.9 renamed the `type` attribute to
  // `class` for layers; the field name here follows Tiled's current spelling, and `type` on the layer
  // union stays the geometry discriminant.
  class: string;
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
  // Whether the image tiles to fill the layer along each axis. False is Tiled's default and what an
  // absent attribute means.
  repeatX: boolean;
  repeatY: boolean;
}

export interface TiledGroupLayer extends TiledLayerBase {
  type: 'group';
  layers: readonly TiledLayer[];
}

export type TiledLayer = TiledTileLayer | TiledObjectGroup | TiledImageLayer | TiledGroupLayer;
