// A single typed custom property from a Tiled document (`<property name type value/>` in TMX, or a
// `{ name, type, value }` entry in TMJ). Properties hang off nearly every Tiled element — the map,
// each layer, each object, the tileset, and individual tiles — so this is the shared leaf of the
// faithful `TiledMap` document. `color` and `file` values are kept as their raw Tiled strings
// (a `#AARRGGBB` color literal, a relative file path); only the map background is projected to a
// packed RGBA number.
export type TiledPropertyType = 'string' | 'int' | 'float' | 'bool' | 'color' | 'file' | 'object';

export interface TiledProperty {
  name: string;
  type: TiledPropertyType;
  value: string | number | boolean;
}
