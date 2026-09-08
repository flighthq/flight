import type { TiledLayer } from './TiledLayer';
import type { TiledProperty } from './TiledProperty';
import type { TiledTilesetRef } from './TiledTileset';

// Which axis the stagger offset runs along for `staggered` and `hexagonal` maps.
export type TiledStaggerAxis = 'x' | 'y';

// Whether the even or the odd indices along the stagger axis are the shifted ones.
export type TiledStaggerIndex = 'even' | 'odd';

// Tiled's map projection. Parsers accept all four; the projection to runtime `Tilemap`s targets
// `orthogonal` first — the others are preserved faithfully in the document but not yet projected.
export type TiledOrientation = 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal';

// The order in which a renderer walks the tile grid. Preserved from the document; the projection
// emits row-major grids regardless.
export type TiledRenderOrder = 'right-down' | 'right-up' | 'left-down' | 'left-up';

// The faithful in-memory form of a parsed Tiled map (TMX or TMJ). Every layer, tileset reference,
// raw GID, property, and orientation is preserved so `formatTiledTmx` can re-emit it losslessly for
// the modeled fields. This is the codec's primitive: `parseTiledTmx`/`parseTiledTmj` produce it, and
// `buildTilemapLayersFromTiled` projects one of its tile layers into runtime `TilemapData`. It forces
// no runtime shape on the caller — a mega "tiled scene" type is deliberately absent.
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
  // Packed RGBA (e.g. `0x336699ff`), or null when the map declares no background color.
  backgroundColor: number | null;
  // Stagger and hex geometry. Meaningful only for `staggered` and `hexagonal` orientations, and null
  // otherwise — which is also what an orthogonal or isometric document carries. Without these a
  // staggered or hexagonal map cannot round-trip even as a document, because the shift direction and
  // the hex edge length are unrecoverable from the grid alone.
  staggerAxis: TiledStaggerAxis | null;
  staggerIndex: TiledStaggerIndex | null;
  // Length of the hex side along the stagger axis, in pixels. Hexagonal maps only.
  hexSideLength: number | null;
  layers: readonly TiledLayer[];
  tilesets: readonly TiledTilesetRef[];
  properties: readonly TiledProperty[];
}
