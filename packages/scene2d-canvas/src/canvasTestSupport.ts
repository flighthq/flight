import {
  createCanvasSurfaceFromNativeHandle,
  destroyCanvasSurface,
  getSurfaceHandle,
} from '@flighthq/surface/contract';
import type {
  AppWindow,
  CanvasRenderOptions,
  CanvasRenderPass,
  CanvasRenderState,
  CanvasScreenRenderTarget,
  CanvasSurface,
  CanvasTextureRenderTarget,
  CanvasTextureResolvers,
  HostCanvasCapability,
  NativeSurfaceHandle,
  RenderTargetClear,
  Surface,
} from '@flighthq/types/contract';

import { beginCanvasRenderPass } from './canvasRenderPass';
import { createCanvasRenderState as createExplicitCanvasRenderState } from './canvasRenderState';
import { registerCanvasHost } from './canvasRenderSurface';
import { createCanvasScreenRenderTarget as createExplicitCanvasScreenRenderTarget } from './canvasScreenRenderTarget';
import { createCanvasTextureRenderTarget as createExplicitCanvasRenderTarget } from './canvasTextureRenderTarget';
import { createCanvasTextureResolvers as createExplicitCanvasTextureResolvers } from './canvasTextureResolver';
import { canvasScene2DRenderPreset } from './scene2DCanvasPipeline';

export * from './canvasRenderState';
export * from './canvasRenderPass';
export * from './canvasScreenRenderTarget';
export * from './canvasTextureRenderTarget';
export * from './canvasTextureResolver';

export const canvasTestHost: HostCanvasCapability = Object.freeze({
  acquire(
    surface: Readonly<Surface>,
    options?: Readonly<CanvasRenderingContext2DSettings>,
  ): CanvasRenderingContext2D | null {
    const handle = getSurfaceHandle(surface) as HTMLCanvasElement;
    const context = handle.getContext('2d', options);
    if (context !== null) return context;
    const fallback = Object.create(null) as CanvasRenderingContext2D;
    Object.defineProperty(fallback, 'canvas', { value: handle });
    return fallback;
  },
  create(_window: Readonly<AppWindow>, width: number, height: number): NativeSurfaceHandle | null {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  createSurface(width: number, height: number): CanvasSurface | null {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return createCanvasSurfaceFromNativeHandle(canvasTestHost, canvas);
  },
  destroySurface(surface: CanvasSurface): void {
    const canvas = getSurfaceHandle(surface) as HTMLCanvasElement;
    destroyCanvasSurface(canvasTestHost, surface);
    canvas.width = 0;
    canvas.height = 0;
  },
  release(_surface: Readonly<Surface>): void {
    // No-op for test host.
  },
});

export function acquireTestCanvasSurface(width = 1, height = 1): CanvasSurface {
  const surface = canvasTestHost.createSurface(width, height);
  if (surface === null) throw new Error('Failed to acquire test Canvas surface.');
  return surface;
}

// Opens a screen pass over `canvas` — the shape of an ordinary frame, in one line, for the many tests
// whose subject is what happens INSIDE a pass rather than the bracket itself.
export function beginCanvasScreenRenderPassForTest(
  state: CanvasRenderState,
  canvas: HTMLCanvasElement,
  clear?: Readonly<RenderTargetClear>,
): CanvasRenderPass {
  return beginCanvasRenderPass(state, createCanvasScreenRenderTargetForTest(canvas), clear);
}

// The whole test rig in one call: a state with the test canvas host registered, and a screen pass
// already open over `canvas`. The open pass is the point — drawing happens inside one, so a unit test
// whose subject is a draw should start where a draw starts. Tests whose subject IS the bracket use
// createCanvasScreenRenderTargetForTest and open their own.
export function createCanvasRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const state = createExplicitCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(), options);
  registerCanvasHost(state, canvasTestHost);
  beginCanvasRenderPass(state, createCanvasScreenRenderTargetForTest(canvas));
  return state;
}

export function createCanvasRenderStateWithoutPass(options: Partial<CanvasRenderOptions> = {}): CanvasRenderState {
  const state = createExplicitCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(), options);
  registerCanvasHost(state, canvasTestHost);
  return state;
}

export function createCanvasScreenRenderTargetForTest(canvas: HTMLCanvasElement): CanvasScreenRenderTarget {
  const surface = createCanvasSurfaceFromNativeHandle(canvasTestHost, canvas);
  if (surface === null) throw new Error('Failed to create test Canvas surface from element.');
  return createExplicitCanvasScreenRenderTarget(surface);
}

export function createCanvasTextureRenderTarget(width: number, height: number): CanvasTextureRenderTarget {
  return createExplicitCanvasRenderTarget(canvasTestHost, width, height);
}

export function createCanvasTextureResolvers(): CanvasTextureResolvers {
  return createExplicitCanvasTextureResolvers(canvasTestHost);
}
