import { setGlRenderSurfaceProvider } from '@flighthq/render-gl/contract';
import type { GlRenderSurfaceProvider } from '@flighthq/types/contract';

import { enableHostWebRaster2DSurface } from './webRaster2DSurface';

let _enabled = false;

export function createWebGlRenderSurfaceProvider(): GlRenderSurfaceProvider {
  return {
    createRenderSurface(width, height, pixelRatio): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      return canvas;
    },
  };
}

export function enableHostWebGlRenderSurface(): void {
  enableHostWebRaster2DSurface();
  if (_enabled) return;
  _enabled = true;
  setGlRenderSurfaceProvider(createWebGlRenderSurfaceProvider());
}

export function resetHostWebGlRenderSurfaceForTest(): void {
  _enabled = false;
}
