import { setWgpuRenderSurfaceProvider } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderSurfaceProvider } from '@flighthq/types/contract';

let _enabled = false;

export function createWebWgpuRenderSurfaceProvider(): WgpuRenderSurfaceProvider {
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

export function enableHostWebWgpuRenderSurface(): void {
  if (_enabled) return;
  _enabled = true;
  setWgpuRenderSurfaceProvider(createWebWgpuRenderSurfaceProvider());
}

export function resetHostWebWgpuRenderSurfaceForTest(): void {
  _enabled = false;
}
