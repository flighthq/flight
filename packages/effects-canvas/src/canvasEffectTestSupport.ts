import {
  createCanvasRenderState as createExplicitCanvasRenderState,
  acquireCanvasRenderSurface,
  createCanvasRenderSurface,
  createCanvasRenderTarget as createExplicitCanvasRenderTarget,
  createCanvasTextureResolvers,
  scene2dCanvasPipeline,
} from '@flighthq/scene2d-canvas/contract';
import type {
  CanvasRenderOptions,
  CanvasRenderState,
  CanvasRenderSurface,
  CanvasRenderSurfaceCreator,
  CanvasRenderTarget,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export const canvasTestSurfaceCreator: CanvasRenderSurfaceCreator = {
  [EntityRuntimeKey]: { binding: null },
  createRenderSurface(width, height, pixelRatio) {
    const canvas = globalThis.document.createElement('canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    return canvas;
  },
  destroyRenderSurface(canvas) {
    canvas.width = 0;
    canvas.height = 0;
  },
};

export function acquireTestCanvasRenderSurface(width = 1, height = 1): CanvasRenderSurface {
  const surface = acquireCanvasRenderSurface(canvasTestSurfaceCreator, { height, pixelRatio: 1, width });
  if (surface === null) throw new Error('Failed to acquire test Canvas surface.');
  return surface;
}

export function createCanvasRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  return createExplicitCanvasRenderState(
    createCanvasRenderSurface(canvasTestSurfaceCreator, canvas),
    scene2dCanvasPipeline,
    createCanvasTextureResolvers(canvasTestSurfaceCreator),
    options,
  );
}

export function createCanvasRenderTarget(width: number, height: number): CanvasRenderTarget {
  return createExplicitCanvasRenderTarget(canvasTestSurfaceCreator, width, height);
}
