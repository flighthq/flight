import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CanvasRenderOptions,
  CanvasRenderState,
  CanvasRenderSurface,
  CanvasRenderSurfaceCreator,
  CanvasRenderTarget,
  CanvasTextureResolvers,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createCanvasRenderState as createExplicitCanvasRenderState } from './canvasRenderState';
import { acquireCanvasRenderSurface, createCanvasRenderSurface } from './canvasRenderSurface';
import { createCanvasRenderTarget as createExplicitCanvasRenderTarget } from './canvasRenderTarget';
import { createCanvasTextureResolvers as createExplicitCanvasTextureResolvers } from './canvasTextureResolver';
import { scene2dCanvasPipeline } from './scene2dCanvasPipeline';

export * from './canvasRenderState';
export * from './canvasRenderTarget';
export * from './canvasTextureResolver';

export const canvasTestSurfaceCreator: CanvasRenderSurfaceCreator = (() => {
  const creator = allocateEntity<CanvasRenderSurfaceCreator>();
  creator.createRenderSurface = (width: number, height: number, pixelRatio: number): HTMLCanvasElement => {
    const canvas = globalThis.document.createElement('canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    return canvas;
  };
  creator.destroyRenderSurface = (canvas: HTMLCanvasElement): void => {
    canvas.width = 0;
    canvas.height = 0;
  };
  creator[EntityRuntimeKey] = { binding: null };
  return creator;
})();

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
    createCanvasTextureResolvers(),
    options,
  );
}

export function createCanvasRenderTarget(width: number, height: number): CanvasRenderTarget {
  return createExplicitCanvasRenderTarget(canvasTestSurfaceCreator, width, height);
}

export function createCanvasTextureResolvers(): CanvasTextureResolvers {
  return createExplicitCanvasTextureResolvers(canvasTestSurfaceCreator);
}
