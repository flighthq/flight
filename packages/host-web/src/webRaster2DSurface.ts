import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createImageResource } from '@flighthq/image/contract';
import type { Entity, Raster2DSurfaceProvider } from '@flighthq/types/contract';

export function createWebRaster2DSurfaceProvider(): Raster2DSurfaceProvider {
    const out = allocateEntity<Raster2DSurfaceProvider>();
  out.createRaster2DSurface = (width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      return createEntity({
        get width(): number {
          return canvas.width;
        },
        set width(value: number) {
          canvas.width = value;
        },
        get height(): number {
          return canvas.height;
        },
        set height(value: number) {
          canvas.height = value;
        },
        context,
        image: createImageResource(canvas),
      });
    };
  out.destroyRaster2DSurface = (surface) => {
      surface.width = 0;
      surface.height = 0;
    };
  return finishEntity(out);
}

export const webRaster2DSurfaceProvider: Raster2DSurfaceProvider = createWebRaster2DSurfaceProvider();
