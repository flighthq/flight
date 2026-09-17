import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, HostSurfaceCreateCapability } from '@flighthq/types/contract';

export function createWebSurfaceCreateCapability(): HostSurfaceCreateCapability {
  const out = allocateEntity<HostSurfaceCreateCapability>();
  initializeWebSurfaceCreateCapability(out);
  return finishEntity(out);
}

export function initializeWebSurfaceCreateCapability(out: EntityConstruction<HostSurfaceCreateCapability>): void {
  out.createSurface = (width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  out.destroySurface = (surface: HTMLCanvasElement): void => {
    surface.width = 0;
    surface.height = 0;
  };
}

export const webSurfaceCreateCapability: HostSurfaceCreateCapability = createWebSurfaceCreateCapability();
