import type { Entity, EntityWithoutRuntime } from './Entity';

export interface TextureAtlasRegion extends Entity {
  height: number;
  id: number;
  pivotX: number | null;
  pivotY: number | null;
  x: number;
  y: number;
  width: number;
}

export type TextureAtlasRegionLike = EntityWithoutRuntime<TextureAtlasRegion>;
