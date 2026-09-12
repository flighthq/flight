import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CanvasRenderSurfaceCreator,
  CanvasTextureRenderTarget,
  EntityConstruction,
} from '@flighthq/types/contract';

import { acquireCanvasRenderSurface, destroyCanvasRenderSurface } from './canvasRenderSurface';

export function createCanvasTextureRenderTarget(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  width: number,
  height: number,
): CanvasTextureRenderTarget {
  const out = allocateEntity<CanvasTextureRenderTarget>();
  initializeCanvasTextureRenderTarget(out, creator, width, height);
  return finishEntity(out);
}

export function destroyCanvasTextureRenderTarget(target: CanvasTextureRenderTarget): void {
  destroyCanvasRenderSurface(target.surface);
  target.width = 0;
  target.height = 0;
}

export function initializeCanvasTextureRenderTarget(
  out: EntityConstruction<CanvasTextureRenderTarget>,
  creator: Readonly<CanvasRenderSurfaceCreator>,
  width: number,
  height: number,
): void {
  const targetWidth = Math.max(1, Math.ceil(width));
  const targetHeight = Math.max(1, Math.ceil(height));
  const surface = acquireCanvasRenderSurface(creator, {
    height: targetHeight,
    pixelRatio: 1,
    width: targetWidth,
  });
  if (surface === null) throw new Error('Failed to acquire Canvas render target surface.');
  out.canvas = surface.canvas;
  out.colorAttachments = 1;
  out.context = surface.context;
  out.height = targetHeight;
  out.surface = surface;
  out.surfaceOwnership = 'flight';
  out.width = targetWidth;
}

export function resizeCanvasTextureRenderTarget(
  target: CanvasTextureRenderTarget,
  width: number,
  height: number,
): void {
  target.canvas.width = Math.max(1, Math.ceil(width));
  target.canvas.height = Math.max(1, Math.ceil(height));
  target.width = target.canvas.width;
  target.height = target.canvas.height;
}
