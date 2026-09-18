import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostSurfaceDisplayCapability, HostSurfaceResizeCapability, Surface } from '@flighthq/types/contract';

import { getWebSurfaceCanvasHandle, getWebSurfaceElementHandle } from './webSurfaceHandle';

export const webHostSurfaceDisplay = (() => {
  const out = allocateEntity<HostSurfaceDisplayCapability>();
  out.setDisplaySize = (surface: Readonly<Surface>, width: number, height: number) => {
    const element = getWebSurfaceElementHandle(surface);
    if (element === null) return;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  };
  return finishEntity(out);
})();

export const webHostSurfaceResize = (() => {
  const out = allocateEntity<HostSurfaceResizeCapability>();
  out.resize = (surface: Readonly<Surface>, width: number, height: number) => {
    const canvas = getWebSurfaceCanvasHandle(surface);
    if (canvas === null) return;
    canvas.width = width;
    canvas.height = height;
  };
  return finishEntity(out);
})();
