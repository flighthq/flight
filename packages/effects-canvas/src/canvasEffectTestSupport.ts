import {
  acquireCanvasRenderSurface,
  beginCanvasRenderPass,
  createCanvasRenderState as createExplicitCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasScreenRenderTarget,
  createCanvasTextureRenderTarget as createExplicitCanvasRenderTarget,
  createCanvasTextureResolvers,
  registerCanvasSurfaceCreator,
  scene2DCanvasPipeline,
} from '@flighthq/scene2d-canvas/contract';
import type {
  CanvasRenderOptions,
  CanvasRenderState,
  CanvasRenderSurface,
  CanvasRenderSurfaceCreator,
  CanvasTextureRenderTarget,
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

// A state with a screen pass already open over `canvas`, so an effect test starts where an effect runs.
export function createCanvasRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const state = createExplicitCanvasRenderState(
    scene2DCanvasPipeline,
    createCanvasTextureResolvers(canvasTestSurfaceCreator),
    options,
  );
  registerCanvasSurfaceCreator(state, canvasTestSurfaceCreator);
  beginCanvasRenderPass(
    state,
    createCanvasScreenRenderTarget(createCanvasRenderSurface(canvasTestSurfaceCreator, canvas)),
  );
  return state;
}

// A state with no pass open, for tests about registration or construction rather than about drawing.
export function createCanvasRenderStateWithoutPass(options: Partial<CanvasRenderOptions> = {}): CanvasRenderState {
  const state = createExplicitCanvasRenderState(
    scene2DCanvasPipeline,
    createCanvasTextureResolvers(canvasTestSurfaceCreator),
    options,
  );
  registerCanvasSurfaceCreator(state, canvasTestSurfaceCreator);
  return state;
}

export function createCanvasTextureRenderTarget(width: number, height: number): CanvasTextureRenderTarget {
  return createExplicitCanvasRenderTarget(canvasTestSurfaceCreator, width, height);
}
