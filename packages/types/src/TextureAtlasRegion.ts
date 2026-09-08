import type { Entity, EntityWithoutRuntime } from './Entity';

export enum TextureAtlasRotation {
  Counterclockwise90 = -1,
  None = 0,
  Clockwise90 = 1,
}

export interface TextureAtlasRegion extends Entity {
  // Packed page-rectangle extent. When rotation is not None, logical drawn width/height are
  // height/width.
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
  // Cardinal quarter-turn applied by the packer. The single enum is both the rotation flag and its
  // direction, so these cannot disagree.
  rotation: TextureAtlasRotation;
  sourceX: number;
  sourceY: number;
  trimmed: boolean;
  x: number;
  y: number;
  // Packed page-rectangle extent. See height.
  width: number;
}

export type TextureAtlasRegionLike = EntityWithoutRuntime<TextureAtlasRegion>;
