import { createImageResource } from '@flighthq/image/contract';
import { installRaster2DSurfaceHostProvider } from '@flighthq/render/contract';
import type { Raster2DSurfaceProvider } from '@flighthq/types/contract';

export function createWebRaster2DSurfaceProvider(): Raster2DSurfaceProvider {
  return {
    createRaster2DSurface(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      return {
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
      };
    },
  };
}

export function enableHostWebRaster2DSurface(): void {
  if (_enabled) return;
  _enabled = true;
  installRaster2DSurfaceHostProvider(createWebRaster2DSurfaceProvider());
}

export function resetHostWebRaster2DSurfaceForTest(): void {
  _enabled = false;
}

let _enabled = false;
