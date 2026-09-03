import type { Entity } from './Entity';

export interface GlRenderSurfaceProvider extends Entity {
  createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement | null;
}
