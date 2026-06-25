import type { Entity, EntityWithoutRuntime } from './Entity';

export interface TextureAtlasRegion extends Entity {
  height: number;
  id: number;
  name: string | null;
  originalHeight: number | null;
  originalWidth: number | null;
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
