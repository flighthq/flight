import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, HostSurfaceCreateCapability } from '@flighthq/types/contract';

export function createWebSurfaceCreateCapability(): HostSurfaceCreateCapability {
  const out = allocateEntity<HostSurfaceCreateCapability>();
  initializeWebSurfaceCreateCapability(out);
  return finishEntity(out);
}

export function initializeWebSurfaceCreateCapability(out: EntityConstruction<HostSurfaceCreateCapability>): void {
  out.createRenderSurface = (width: number, height: number, pixelRatio: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    return canvas;
  };
  out.destroyRenderSurface = (surface: HTMLCanvasElement): void => {
    surface.width = 0;
    surface.height = 0;
  };
}

export const webSurfaceCreateCapability: HostSurfaceCreateCapability = createWebSurfaceCreateCapability();
