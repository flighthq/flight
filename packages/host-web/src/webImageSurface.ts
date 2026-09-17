import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, ImageSurface, ImageSurfaceCreator } from '@flighthq/types/contract';

import { createWebImageResourceFromCanvas } from './webImageResource';

export function createWebImageSurfaceCreator(): ImageSurfaceCreator {
  const out = allocateEntity<ImageSurfaceCreator>();
  initializeWebImageSurfaceCreator(out);
  return finishEntity(out);
}

export function initializeWebImageSurfaceCreator(out: EntityConstruction<ImageSurfaceCreator>): void {
  out.createImageSurface = (width, height) => {
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
  out.destroyImageSurface = (surface) => {
    surface.width = 0;
    surface.height = 0;
  };
}

export const webImageSurfaceCreator: ImageSurfaceCreator = createWebImageSurfaceCreator();
