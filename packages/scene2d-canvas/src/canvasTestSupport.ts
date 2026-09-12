import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CanvasRenderOptions,
  CanvasRenderState,
  CanvasRenderSurface,
  CanvasRenderPass,
  CanvasRenderSurfaceCreator,
  CanvasScreenRenderTarget,
  CanvasTextureRenderTarget,
  RenderTargetClear,
  CanvasTextureResolvers,
  EntityConstruction,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { beginCanvasRenderPass } from './canvasRenderPass';
import { createCanvasRenderState as createExplicitCanvasRenderState } from './canvasRenderState';
import {
  acquireCanvasRenderSurface,
  createCanvasRenderSurface,
  registerCanvasSurfaceCreator,
} from './canvasRenderSurface';
import { createCanvasScreenRenderTarget as createExplicitCanvasScreenRenderTarget } from './canvasScreenRenderTarget';
import { createCanvasTextureRenderTarget as createExplicitCanvasRenderTarget } from './canvasTextureRenderTarget';
import { createCanvasTextureResolvers as createExplicitCanvasTextureResolvers } from './canvasTextureResolver';
import { scene2DCanvasPipeline } from './scene2DCanvasPipeline';

export * from './canvasRenderState';
export * from './canvasRenderPass';
export * from './canvasScreenRenderTarget';
export * from './canvasTextureRenderTarget';
export * from './canvasTextureResolver';

export const canvasTestSurfaceCreator: CanvasRenderSurfaceCreator = (() => {
  const creator = allocateEntity<CanvasRenderSurfaceCreator>();
  initializeCanvasRenderSurfaceCreator(
    creator,
    (width: number, height: number, pixelRatio: number): HTMLCanvasElement => {
      const canvas = globalThis.document.createElement('canvas');
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      return canvas;
    },
    (canvas: HTMLCanvasElement): void => {
      canvas.width = 0;
      canvas.height = 0;
    },
  );
  creator[EntityRuntimeKey] = { binding: null };
  return finishEntity(creator);
})();

export function acquireTestCanvasRenderSurface(width = 1, height = 1): CanvasRenderSurface {
  const surface = acquireCanvasRenderSurface(canvasTestSurfaceCreator, { height, pixelRatio: 1, width });
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

// The whole test rig in one call: a state with the test surface creator registered, and a screen pass
// already open over `canvas`. The open pass is the point — drawing happens inside one, so a unit test
// whose subject is a draw should start where a draw starts. Tests whose subject IS the bracket use
// createCanvasScreenRenderTargetForTest and open their own.
export function createCanvasRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const state = createExplicitCanvasRenderState(scene2DCanvasPipeline, createCanvasTextureResolvers(), options);
  registerCanvasSurfaceCreator(state, canvasTestSurfaceCreator);
  beginCanvasRenderPass(state, createCanvasScreenRenderTargetForTest(canvas));
  return state;
}

// A state with no pass open, for tests about construction or about what a state carries before it draws.
export function createCanvasRenderStateWithoutPass(options: Partial<CanvasRenderOptions> = {}): CanvasRenderState {
  const state = createExplicitCanvasRenderState(scene2DCanvasPipeline, createCanvasTextureResolvers(), options);
  registerCanvasSurfaceCreator(state, canvasTestSurfaceCreator);
  return state;
}

// The screen half. A state and a screen target are independent, so a test whose subject is neither the
// bracket nor the surface takes the state alone.
export function createCanvasScreenRenderTargetForTest(canvas: HTMLCanvasElement): CanvasScreenRenderTarget {
  return createExplicitCanvasScreenRenderTarget(createCanvasRenderSurface(canvasTestSurfaceCreator, canvas));
}

export function createCanvasTextureRenderTarget(width: number, height: number): CanvasTextureRenderTarget {
  return createExplicitCanvasRenderTarget(canvasTestSurfaceCreator, width, height);
}

export function createCanvasTextureResolvers(): CanvasTextureResolvers {
  return createExplicitCanvasTextureResolvers(canvasTestSurfaceCreator);
}

export function initializeCanvasRenderSurfaceCreator(
  out: EntityConstruction<CanvasRenderSurfaceCreator>,
  createRenderSurface: CanvasRenderSurfaceCreator['createRenderSurface'],
  destroyRenderSurface: CanvasRenderSurfaceCreator['destroyRenderSurface'],
): void {
  out.createRenderSurface = createRenderSurface;
  out.destroyRenderSurface = destroyRenderSurface;
}
