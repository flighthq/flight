import type { Entity, EntityWithoutRuntime } from './Entity';

export interface TextureAtlasRegion extends Entity {
  height: number;
  id: number;
  name: string | null;
  originalHeight: number | null;
  originalWidth: number | null;
  // Which page image this region was packed into, for formats that carry several. A multi-page
  // libGDX atlas concatenates every page's regions into one atlas, so without this the caller cannot
  // tell them apart. Null when the format declares one page or none.
  pageName: string | null;
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
  sourceX: number;
  sourceY: number;
  trimmed: boolean;
  x: number;
  y: number;
  width: number;
}

export type TextureAtlasRegionLike = EntityWithoutRuntime<TextureAtlasRegion>;
