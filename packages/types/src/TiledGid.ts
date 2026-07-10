// The decoded form of a Tiled global tile id (GID). Each cell in a Tiled tile layer stores a raw
// 32-bit GID whose three high bits are flip flags and whose low 29 bits are the global tile id
// (0 = empty). `decodeTiledGid` (in `@flighthq/tilemap-formats`) splits a raw GID into this shape;
// the faithful `TiledMap` document keeps the raw GIDs so the flags survive a `format*` round-trip.
export interface TiledGid {
  // The global tile id with the flip bits masked off (0 = empty cell). Resolve to a tileset via its
  // owning `TiledTilesetRef.firstGid`; the local id within that tileset is `tileId - firstGid`.
  tileId: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  flipDiagonal: boolean;
}
