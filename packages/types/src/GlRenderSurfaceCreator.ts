import type { Entity } from './Entity';

export interface GlRenderSurfaceCreator extends Entity {
  createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement | null;
}
