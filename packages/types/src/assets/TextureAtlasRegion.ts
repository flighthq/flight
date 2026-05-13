import type { Entity } from '../foundation';

export interface TextureAtlasRegion extends Entity {
  height: number;
  id: number;
  pivotX: number | null;
  pivotY: number | null;
  x: number;
  y: number;
  width: number;
}
