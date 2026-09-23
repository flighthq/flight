import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasTextureRenderTarget, EntityConstruction, HostCanvasCapability } from '@flighthq/types/contract';

import { acquireCanvasSurface, destroyCanvasSurfaceOwned } from './canvasRenderSurface';

export function createCanvasTextureRenderTarget(
  canvasHost: Readonly<HostCanvasCapability>,
  width: number,
  height: number,
): CanvasTextureRenderTarget {
  const out = allocateEntity<CanvasTextureRenderTarget>();
  initializeCanvasTextureRenderTarget(out, canvasHost, width, height);
  return finishEntity(out);
}

export function destroyCanvasTextureRenderTarget(target: CanvasTextureRenderTarget): void {
  destroyCanvasSurfaceOwned(target.surface);
  target.width = 0;
  target.height = 0;
}

export function initializeCanvasTextureRenderTarget(
  out: EntityConstruction<CanvasTextureRenderTarget>,
  canvasHost: Readonly<HostCanvasCapability>,
  width: number,
  height: number,
): void {
  const targetWidth = Math.max(1, Math.ceil(width));
  const targetHeight = Math.max(1, Math.ceil(height));
  const surface = acquireCanvasSurface(canvasHost, targetWidth, targetHeight);
  if (surface === null) throw new Error('Failed to acquire Canvas render target surface.');
  out.canvas = surface.context.canvas as HTMLCanvasElement;
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
