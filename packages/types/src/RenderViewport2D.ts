import type { Entity } from './Entity';

export interface RenderViewport2D extends Entity {
  height: number;
  width: number;
  x: number;
  y: number;
}
