/** Identifies a tilemap or tileset document format for detection and dispatch.
 *
 *  Open string alias: use a vendor-prefixed value (e.g. `'acme.MyTilemap'`) for a custom format so it
 *  cannot collide with a built-in kind string. */
export type TilemapFormatKind = string;
/** Tiled TMX map: XML whose root element is `<map>`. */
export const TilemapFormatKindTiledTmx = 'TiledTmx';
/** Tiled TMJ map: JSON whose `type` is `map`. */
export const TilemapFormatKindTiledTmj = 'TiledTmj';
/** Tiled TSX tileset: XML whose root element is `<tileset>`. */
export const TilemapFormatKindTiledTsx = 'TiledTsx';
/** Tiled TSJ tileset: JSON whose `type` is `tileset`. */
export const TilemapFormatKindTiledTsj = 'TiledTsj';
