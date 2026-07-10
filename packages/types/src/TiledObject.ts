import type { TiledProperty } from './TiledProperty';
import type { Vector2Like } from './Vector2';

// One object from a Tiled object group (`<object>` in TMX, an `objects[]` entry in TMJ). The shape
// is a faithful union of Tiled's mutually-exclusive object geometries expressed as optional markers:
// a plain rectangle (the default — `point`/`ellipse` false and `polygon`/`polyline` null), a `point`,
// an `ellipse`, a `polygon`, a `polyline`, or a tile object (`gid` set). Coordinates are in Tiled's
// pixel space; `polygon`/`polyline` vertices are relative to (`x`, `y`).
export interface TiledObject {
  id: number;
  name: string;
  // Tiled's user-assigned class/type string (the `type`/`class` attribute), not a geometry
  // discriminant — the geometry is carried by `gid`/`point`/`ellipse`/`polygon`/`polyline`.
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Non-null when this is a tile object placed from a tileset; the raw GID carries flip bits (decode
  // with `decodeTiledGid`).
  gid: number | null;
  point: boolean;
  ellipse: boolean;
  polygon: readonly Vector2Like[] | null;
  polyline: readonly Vector2Like[] | null;
  properties: readonly TiledProperty[];
}
