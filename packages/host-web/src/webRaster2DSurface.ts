import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createImageResource } from '@flighthq/image/contract';
import type { Raster2DSurface, Raster2DSurfaceProvider } from '@flighthq/types/contract';

export function createWebRaster2DSurfaceProvider(): Raster2DSurfaceProvider {
  const out = allocateEntity<Raster2DSurfaceProvider>();
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
      },
      enumerable: true,
      configurable: true,
    });
    surface.context = context;
    surface.image = createImageResource(canvas);
    return finishEntity(surface);
  };
  out.destroyRaster2DSurface = (surface) => {
    surface.width = 0;
    surface.height = 0;
  };
  return finishEntity(out);
}

export const webRaster2DSurfaceProvider: Raster2DSurfaceProvider = createWebRaster2DSurfaceProvider();
