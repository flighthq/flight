import { createMatrix } from '@flighthq/geometry';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  setRenderStateBackgroundColor,
} from '@flighthq/render';
import type { CanvasRenderOptions, CanvasRenderState, CanvasRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function createCanvasRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const context = canvas.getContext('2d', options.contextAttributes || undefined);
  if (!context) throw new Error('Failed to get context for canvas.');

  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: options.renderTransform ?? createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as CanvasRenderState;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  // canvas/context/contextAttributes are readonly handles on the entity; written once here at the
  // construction boundary.
  state.applyBlendMode = null;
  state.canvasCSSFilterResolver = null;
  (state as { canvas: HTMLCanvasElement }).canvas = canvas;
  (state as { context: CanvasRenderingContext2D }).context = context;
  (state as { contextAttributes: CanvasRenderingContext2DSettings }).contextAttributes = context.getContextAttributes();

  const runtime = createCanvasRenderStateRuntime();
  state[EntityRuntimeKey] = runtime;
  runtime.currentBlendMode = null;
  runtime.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  runtime.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';

  context.imageSmoothingEnabled = runtime.imageSmoothingEnabled;
  context.imageSmoothingQuality = runtime.imageSmoothingQuality;
  return state;
}

// Allocates the package-private 2D-canvas runtime for a CanvasRenderState. createCanvasRenderState
// attaches one to each state under EntityRuntimeKey and populates its fields;
// getCanvasRenderStateRuntime reads it back. The render path writes the returned object every frame,
// so the return is intentionally mutable (not Readonly).
export function createCanvasRenderStateRuntime(): CanvasRenderStateRuntime {
  return createRenderStateRuntime() as CanvasRenderStateRuntime;
}

// Resolves the package-private 2D-canvas runtime attached to a CanvasRenderState. Mutable by design:
// the render path writes its fields every frame.
export function getCanvasRenderStateRuntime(state: CanvasRenderState): CanvasRenderStateRuntime {
  return state[EntityRuntimeKey] as CanvasRenderStateRuntime;
}
