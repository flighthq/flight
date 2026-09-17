import type { Entity } from './Entity';

export interface HostSurfaceCreateCapability extends Entity {
  createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement;
  destroyRenderSurface(surface: HTMLCanvasElement): void;
}
