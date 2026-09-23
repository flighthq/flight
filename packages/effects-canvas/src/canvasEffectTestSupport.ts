import {
  beginCanvasRenderPass,
  createCanvasRenderState as createExplicitCanvasRenderState,
  createCanvasScreenRenderTarget,
  createCanvasTextureRenderTarget as createExplicitCanvasRenderTarget,
  createCanvasTextureResolvers,
  registerCanvasHost,
  canvasScene2DRenderPreset,
} from '@flighthq/scene2d-canvas/contract';
import {
  createCanvasSurfaceFromNativeHandle,
  destroyCanvasSurface,
  getSurfaceHandle,
} from '@flighthq/surface/contract';
import type {
  CanvasRenderOptions,
  CanvasRenderState,
  CanvasSurface,
  CanvasTextureRenderTarget,
  HostCanvasCapability,
  ImageResource,
} from '@flighthq/types/contract';

export const canvasTestHost: HostCanvasCapability = {
  acquire(surface, options) {
    const handle = getSurfaceHandle(surface) as HTMLCanvasElement;
    return handle.getContext('2d', options);
  },
  create(_win, width, height) {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  createImageResource(_surface: Readonly<CanvasSurface>): ImageResource {
    throw new Error('canvasTestHost does not support createImageResource');
  },
  createSurface(width, height) {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return createCanvasSurfaceFromNativeHandle(canvasTestHost, canvas);
  },
  destroySurface(surface: CanvasSurface) {
    const canvas = getSurfaceHandle(surface) as HTMLCanvasElement;
    destroyCanvasSurface(canvasTestHost, surface);
    canvas.width = 0;
    canvas.height = 0;
  },
  release() {},
};

export function acquireTestCanvasSurface(width = 1, height = 1): CanvasSurface {
  const surface = canvasTestHost.createSurface(width, height);
  if (surface === null) throw new Error('Failed to acquire test Canvas surface.');
  return surface;
}

export function createCanvasRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const state = createExplicitCanvasRenderState(
    canvasScene2DRenderPreset,
    createCanvasTextureResolvers(canvasTestHost),
    options,
  );
  registerCanvasHost(state, canvasTestHost);
  const surface = createCanvasSurfaceFromNativeHandle(canvasTestHost, canvas);
  if (surface === null) throw new Error('Failed to create test screen surface.');
  beginCanvasRenderPass(state, createCanvasScreenRenderTarget(surface));
  return state;
}

export function createCanvasRenderStateWithoutPass(options: Partial<CanvasRenderOptions> = {}): CanvasRenderState {
  const state = createExplicitCanvasRenderState(
    canvasScene2DRenderPreset,
    createCanvasTextureResolvers(canvasTestHost),
    options,
  );
  registerCanvasHost(state, canvasTestHost);
  return state;
}

export function createCanvasTextureRenderTarget(width: number, height: number): CanvasTextureRenderTarget {
  return createExplicitCanvasRenderTarget(canvasTestHost, width, height);
}
