import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { setGlRenderSurfaceProvider } from '@flighthq/render-gl/contract';
import type { Entity, GlRenderSurfaceProvider } from '@flighthq/types/contract';

let _enabled = false;

export function createWebGlRenderSurfaceProvider(): GlRenderSurfaceProvider {
  const out = allocateEntity<GlRenderSurfaceProvider>();
  out.createRenderSurface = (width, height, pixelRatio): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    return canvas;
  };
  return finishEntity(out);
}

export function enableHostWebGlRenderSurface(): void {
  if (_enabled) return;
  _enabled = true;
  setGlRenderSurfaceProvider(createWebGlRenderSurfaceProvider());
}

export function resetHostWebGlRenderSurfaceForTest(): void {
  _enabled = false;
}
