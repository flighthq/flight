import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { setGlRenderSurfaceProvider } from '@flighthq/render-gl/contract';
import type { GlRenderSurfaceProvider, EntityConstruction } from '@flighthq/types/contract';

let _enabled = false;

export function createWebGlRenderSurfaceProvider(): GlRenderSurfaceProvider {
  const out = allocateEntity<GlRenderSurfaceProvider>();
  initializeWebGlRenderSurfaceProvider(out);
  return finishEntity(out);
}

export function enableHostWebGlRenderSurface(): void {
  if (_enabled) return;
  _enabled = true;
  setGlRenderSurfaceProvider(createWebGlRenderSurfaceProvider());
}

export function initializeWebGlRenderSurfaceProvider(out: EntityConstruction<GlRenderSurfaceProvider>): void {
  out.createRenderSurface = (width, height, pixelRatio): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    return canvas;
  };
}

export function resetHostWebGlRenderSurfaceForTest(): void {
  _enabled = false;
}
