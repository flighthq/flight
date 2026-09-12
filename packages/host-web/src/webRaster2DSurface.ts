import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, Raster2DSurface, Raster2DSurfaceProvider } from '@flighthq/types/contract';

import { createWebImageResourceFromCanvas } from './webImageResource';

export function createWebRaster2DSurfaceProvider(): Raster2DSurfaceProvider {
  const out = allocateEntity<Raster2DSurfaceProvider>();
  initializeWebRaster2DSurfaceProvider(out);
  return finishEntity(out);
}

export function initializeWebRaster2DSurfaceProvider(out: EntityConstruction<Raster2DSurfaceProvider>): void {
  out.createRaster2DSurface = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    const surface = allocateEntity<Raster2DSurface>();
    Object.defineProperty(surface, 'width', {
      get() {
        return canvas.width;
      },
      set(value: number) {
        canvas.width = value;
        // The resource borrows this canvas, so a resize here IS its new size. Writing it through keeps
        // the pair correct without the resource having to measure the element back through a host.
        surface.image.width = value;
      },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(surface, 'height', {
      get() {
        return canvas.height;
      },
      set(value: number) {
        canvas.height = value;
        surface.image.height = value;
      },
      enumerable: true,
      configurable: true,
    });
    surface.context = context;
    surface.image = createWebImageResourceFromCanvas(canvas);
    return finishEntity(surface);
  };
  out.destroyRaster2DSurface = (surface) => {
    surface.width = 0;
    surface.height = 0;
  };
}

export const webRaster2DSurfaceProvider: Raster2DSurfaceProvider = createWebRaster2DSurfaceProvider();
