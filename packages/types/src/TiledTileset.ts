import type { TiledObject } from './TiledObject';
import type { TiledProperty } from './TiledProperty';

// One frame of a tile's flip-book animation (`<frame tileid duration/>`). `tileId` is a local id
// within the owning tileset; `duration` is in milliseconds.
export interface TiledTilesetTileFrame {
  tileId: number;
  duration: number;
}

// Per-tile metadata for a single tile within a tileset (`<tile>` in TSX/embedded). Only tiles that
// carry extra data appear here — most tiles are implicit grid cells with none. `objects` holds the
// tile's collision shapes (its `<objectgroup>`); `animation` its frame sequence; `image` a per-tile
// image for image-collection tilesets.
export interface TiledTilesetTile {
  // Local tile id within the owning tileset (0-based), not a global GID.
  id: number;
  type: string;
  properties: readonly TiledProperty[];
  animation: readonly TiledTilesetTileFrame[] | null;
  objects: readonly TiledObject[] | null;
  image: string | null;
}

// A tileset definition — either embedded in a map or standalone in a TSX/TSJ sidecar. `image` is the
// atlas image path for a single-image tileset (null for an image-collection tileset, where each tile
// carries its own `image`). Sizes/margin/spacing describe the grid the codec resolves into runtime
// Tilemap atlas/layout data at projection time.
// Which corner or edge of a tile object its (x, y) position addresses. `unspecified` is Tiled's own
// default marker and is preserved rather than resolved here, because the effective default depends on
// the map's orientation — resolving it in the document would bake one orientation's answer in.
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
  // Pixel offset applied when drawing every tile of this tileset, from `<tileoffset x y/>`. Zero on
  // both axes when the tileset declares none. RENDER-RELEVANT: a consumer that ignores it places every
  // tile of the tileset wrong, which is why it is modeled rather than left to the projection.
  tileOffsetX: number;
  tileOffsetY: number;
  // Which point of a tile object its position addresses. `unspecified` when the tileset declares none.
  objectAlignment: TiledObjectAlignment;
  tiles: readonly TiledTilesetTile[];
  properties: readonly TiledProperty[];
}

// A map's reference to a tileset, keyed by the `firstGid` that anchors its global-id range. Exactly
// one of `source`/`tileset` is meaningful: `source` names an external TSX/TSJ file (resolved by the
// caller), while `tileset` holds an embedded definition. A global tile id belongs to the ref with the
// largest `firstGid` less than or equal to it.
export interface TiledTilesetRef {
  firstGid: number;
  source: string | null;
  tileset: TiledTileset | null;
}
