import type { AppWindow, GlContextOptions, HostGlCapability, Surface } from '@flighthq/types/contract';

import { getWebGlContext } from './webGlContext';
import { allocateWebSurfaceCanvas, getWebSurfaceCanvasHandle } from './webSurfaceHandle';

function createWebHostGl(): HostGlCapability {
  const out = {} as HostGlCapability;
  initializeWebHostGl(out);
  return out;
}

function initializeWebHostGl(out: HostGlCapability): void {
  out.acquire = (surface: Readonly<Surface>, options?: Readonly<GlContextOptions>) => {
    const canvas = getWebSurfaceCanvasHandle(surface);
    // null covers both reasons the slot cannot hand out a context: a drawable that is not a canvas, and a
    // canvas the browser refuses WebGL2 on. The caller distinguishes them with its own record.
    return canvas === null ? null : getWebGlContext(canvas, options);
  };
  // Allocation only. Whether the browser will grant WebGL2 on the new canvas is reported by acquire, so
  // the two sentinels stay distinct: null here means no drawable, null there means no context.
  out.create = (win: Readonly<AppWindow>, width: number, height: number) =>
    allocateWebSurfaceCanvas(win, width, height);
  out.release = (_surface: Readonly<Surface>) => {
    // The DOM owns context lifetime: a canvas's WebGL2 context is released with the canvas, so the web
    // host holds no GPU resource to free. A native host frees one here.
  };
  out.subscribe = (surface: Readonly<Surface>, onLost: () => void, onRestored: () => void) => {
    const canvas = getWebSurfaceCanvasHandle(surface);
    if (canvas === null) return noop;
    const onContextLost = (event: Event): void => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  };
}

export const webHostGl: HostGlCapability = createWebHostGl();

function noop(): void {}
