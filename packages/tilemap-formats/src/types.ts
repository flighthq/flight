import type { Vector2Like } from '@flighthq/geometry/contract';
import type { ImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { TilemapData } from '@flighthq/tilemap/contract';

import type { TilemapFormatKind } from './tilemapFormatKind.ts';

export interface TiledGid {
  tileId: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  flipDiagonal: boolean;
}

export type TiledPropertyType = 'string' | 'int' | 'float' | 'bool' | 'color' | 'file' | 'object';

export interface TiledProperty {
  name: string;
  type: TiledPropertyType;
  value: string | number | boolean;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  gid: number | null;
  point: boolean;
  ellipse: boolean;
  polygon: readonly Vector2Like[] | null;
  polyline: readonly Vector2Like[] | null;
  rotation: number;
  visible: boolean;
  properties: readonly TiledProperty[];
}

export interface TiledLayerBase {
  id: number;
  name: string;
  opacity: number;
  visible: boolean;
  offsetX: number;
  offsetY: number;
  tintColor: number | null;
  parallaxX: number;
  parallaxY: number;
  class: string;
  properties: readonly TiledProperty[];
}

export interface TiledTileLayer extends TiledLayerBase {
  type: 'tilelayer';
  width: number;
  height: number;
  data: Uint32Array;
}

export interface TiledObjectGroup extends TiledLayerBase {
  type: 'objectgroup';
  objects: readonly TiledObject[];
}

export interface TiledImageLayer extends TiledLayerBase {
  type: 'imagelayer';
  image: string;
  repeatX: boolean;
  repeatY: boolean;
}

export interface TiledGroupLayer extends TiledLayerBase {
  type: 'group';
  layers: readonly TiledLayer[];
}

export type TiledLayer = TiledTileLayer | TiledObjectGroup | TiledImageLayer | TiledGroupLayer;

export interface TiledTilesetTileFrame {
  tileId: number;
  duration: number;
}

export interface TiledTilesetTile {
  id: number;
  type: string;
  properties: readonly TiledProperty[];
  animation: readonly TiledTilesetTileFrame[] | null;
  objects: readonly TiledObject[] | null;
  image: string | null;
}

export type TiledObjectAlignment =
  | 'unspecified'
  | 'topleft'
  | 'top'
  | 'topright'
  | 'left'
  | 'center'
  | 'right'
  | 'bottomleft'
  | 'bottom'
  | 'bottomright';

export interface TiledTileset {
  name: string;
  tileWidth: number;
  tileHeight: number;
  tileCount: number;
  columns: number;
  image: string | null;
  imageWidth: number;
  imageHeight: number;
  margin: number;
  spacing: number;
  tileOffsetX: number;
  tileOffsetY: number;
  objectAlignment: TiledObjectAlignment;
  tiles: readonly TiledTilesetTile[];
  properties: readonly TiledProperty[];
}

export interface TiledTilesetRef {
  firstGid: number;
  source: string | null;
  tileset: TiledTileset | null;
}

export type TiledStaggerAxis = 'x' | 'y';
export type TiledStaggerIndex = 'even' | 'odd';
export type TiledOrientation = 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal';
export type TiledRenderOrder = 'right-down' | 'right-up' | 'left-down' | 'left-up';

export interface TiledMap {
  version: string;
  tiledVersion: string | null;
  orientation: TiledOrientation;
  renderOrder: TiledRenderOrder;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  infinite: boolean;
  backgroundColor: number | null;
  staggerAxis: TiledStaggerAxis | null;
  staggerIndex: TiledStaggerIndex | null;
  hexSideLength: number | null;
  layers: readonly TiledLayer[];
  tilesets: readonly TiledTilesetRef[];
  properties: readonly TiledProperty[];
}

export type TiledLayerDataFailure = 'compressed-without-inflate' | 'inflate-failed';

export interface TiledLayerDataExplanation {
  preservedAsZeroGrid: boolean;
  reason: TiledLayerDataFailure | 'decoded';
}

export type TiledCompression = 'gzip' | 'zlib' | 'zstd';
export type TiledInflate = (bytes: Readonly<Uint8Array>, compression: TiledCompression) => Uint8Array | null;

export interface TiledParseOptions {
  inflate?: TiledInflate;
}

export type TiledTilesetResolver = (
  ref: Readonly<TiledTilesetRef>,
) => Readonly<Pick<TilemapData, 'atlas' | 'tileHeight' | 'tileWidth'>> | null;

export interface TilemapFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options?: Readonly<TiledParseOptions>, diagnostics?: ImportDiagnostic[]) => TiledMap | null;
}

export interface TilemapFormatDescriptor {
  readonly entry: TilemapFormatEntry;
  readonly kind: TilemapFormatKind;
}

export interface TilesetFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options?: Readonly<TiledParseOptions>, diagnostics?: ImportDiagnostic[]) => TiledTileset | null;
}

export interface TilesetFormatDescriptor {
  readonly entry: TilesetFormatEntry;
  readonly kind: TilemapFormatKind;
}

export interface TilemapImportOptions {
  readonly mapFormats?: readonly Readonly<TilemapFormatDescriptor>[];
  readonly tilesetFormats?: readonly Readonly<TilesetFormatDescriptor>[];
}
