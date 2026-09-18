import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ApplicationWindow,
  EntityConstruction,
  HostCanvasCapability,
  Surface,
} from '@flighthq/types/contract';

import { createWebSurfaceCanvas, getWebSurfaceCanvasHandle } from './webSurfaceHandle';

export function createWebHostCanvas(): HostCanvasCapability {
  const out = allocateEntity<HostCanvasCapability>();
  initializeWebHostCanvas(out);
  return finishEntity(out);
}

export function initializeWebHostCanvas(out: EntityConstruction<HostCanvasCapability>): void {
  out.acquire = (surface: Readonly<Surface>, options?: Readonly<CanvasRenderingContext2DSettings>) => {
    const canvas = getWebSurfaceCanvasHandle(surface);
    if (canvas === null) return null;
    return canvas.getContext('2d', options);
  };
  out.create = (win: Readonly<ApplicationWindow>, width: number, height: number) =>
    createWebSurfaceCanvas(win, width, height);
  out.release = (_surface: Readonly<Surface>) => {
    // The DOM owns context lifetime: a canvas's 2D context is released with the canvas, so the web host
    // holds no resource to free. A native host frees its cairo/Direct2D surface here.
  };
}

export const webHostCanvas: HostCanvasCapability = createWebHostCanvas();
