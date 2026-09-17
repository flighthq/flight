import type { Entity } from './Entity';

export interface HostSurfaceCreateCapability extends Entity {
  createSurface(width: number, height: number): HTMLCanvasElement;
  destroySurface(surface: HTMLCanvasElement): void;
}
