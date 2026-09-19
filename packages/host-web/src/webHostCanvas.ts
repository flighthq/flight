import type { AppWindow, HostCanvasCapability, Surface } from '@flighthq/types/contract';

import { allocateWebSurfaceCanvas, getWebSurfaceCanvasHandle } from './webSurfaceHandle';

function createWebHostCanvas(): HostCanvasCapability {
  const out = {} as HostCanvasCapability;
  initializeWebHostCanvas(out);
  return out;
}

function initializeWebHostCanvas(out: HostCanvasCapability): void {
  out.acquire = (surface: Readonly<Surface>, options?: Readonly<CanvasRenderingContext2DSettings>) => {
    const canvas = getWebSurfaceCanvasHandle(surface);
    if (canvas === null) return null;
    return canvas.getContext('2d', options);
  };
  out.create = (win: Readonly<AppWindow>, width: number, height: number) =>
    allocateWebSurfaceCanvas(win, width, height);
  out.release = (_surface: Readonly<Surface>) => {
    // The DOM owns context lifetime: a canvas's 2D context is released with the canvas, so the web host
    // holds no resource to free. A native host frees its cairo/Direct2D surface here.
  };
}

export const webHostCanvas: HostCanvasCapability = createWebHostCanvas();
