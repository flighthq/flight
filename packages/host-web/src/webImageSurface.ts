import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ImageSurface, ImageSurfaceCreator, NonEntityCreateResult } from '@flighthq/types/contract';

import { createWebImageResourceFromCanvas } from './webImageResource';

export function createWebImageSurfaceCreator(): NonEntityCreateResult<Readonly<ImageSurfaceCreator>, 'descriptor'> {
  return Object.freeze({
    createImageSurface: (width: number, height: number): ImageSurface | null => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      const surface = allocateEntity<ImageSurface>();
      Object.defineProperty(surface, 'width', {
        get() {
          return canvas.width;
        },
        set(value: number) {
          canvas.width = value;
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
    },
    destroyImageSurface: (surface: ImageSurface): void => {
      surface.width = 0;
      surface.height = 0;
    },
  });
}

export const webImageSurfaceCreator: Readonly<ImageSurfaceCreator> = createWebImageSurfaceCreator();
