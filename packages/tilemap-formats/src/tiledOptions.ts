import type { TiledTilesetRef, Tileset } from '@flighthq/types';

// Compression applied to a base64-encoded tile-layer payload. Tiled emits `gzip`/`zlib` (and,
// recently, `zstd`); the codec never bundles a decompressor, so the caller decodes these through a
// `TiledInflate` seam.
export type TiledCompression = 'gzip' | 'zlib' | 'zstd';

// Caller-supplied decompressor for compressed layer data. Receives the raw compressed bytes and the
// declared compression, returns the inflated bytes, or null when it cannot decode (the layer is then
// preserved as an all-zero grid rather than dropped). Kept a callback so no zlib implementation is
// pulled into the bundle.
export type TiledInflate = (bytes: Readonly<Uint8Array>, compression: TiledCompression) => Uint8Array | null;

// Options common to the map and tileset parsers.
export interface TiledParseOptions {
  inflate?: TiledInflate;
}

// Resolves a document's tileset reference to a runtime `Tileset` during projection. The caller owns
// atlas loading and external TSX/TSJ resolution; returning null means the tileset is unavailable and
// its tiles are treated as empty. See `buildTilemapLayersFromTiled`.
export type TiledTilesetResolver = (ref: Readonly<TiledTilesetRef>) => Tileset | null;
