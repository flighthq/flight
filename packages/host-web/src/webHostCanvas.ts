import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, HostCanvasCapability, HostTarget } from '@flighthq/types/contract';

import { allocateWebHostTargetCanvas, getCanvasForTarget } from './webHostTarget';

export function createWebHostCanvas(): HostCanvasCapability {
  const out = allocateEntity<HostCanvasCapability>();
  initializeWebHostCanvas(out);
  return finishEntity(out);
}

export function initializeWebHostCanvas(out: EntityConstruction<HostCanvasCapability>): void {
  out.acquire = (target: HostTarget, options?: Readonly<CanvasRenderingContext2DSettings>) => {
    const canvas = getCanvasForTarget(target);
    if (canvas === null) return null;
    return canvas.getContext('2d', options);
  };
  out.create = (width: number, height: number) => allocateWebHostTargetCanvas(width, height);
  out.release = (_target: HostTarget) => {
    // The DOM owns context lifetime: a canvas's 2D context is released with the canvas, so the web host
    // holds no resource to free. A native host frees its cairo/Direct2D surface here.
  };
}

export const webHostCanvas: HostCanvasCapability = createWebHostCanvas();
