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
// carries its own `image`). Sizes/margin/spacing describe the grid the codec resolves into a runtime
// `Tileset` at projection time.
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
