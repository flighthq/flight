import type { Entity } from './Entity';

export interface WgpuRenderSurfaceProvider extends Entity {
  createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement | null;
}
