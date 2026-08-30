import { createMatrix } from '@flighthq/geometry/contract';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  destroyRenderState,
  setRenderStateBackgroundColor,
} from '@flighthq/render/contract';
import type {
  CanvasPipeline,
  CanvasRenderOptions,
  CanvasRenderSurface,
  CanvasRenderState,
  CanvasRenderStateRuntime,
  CanvasTextureResolvers,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { destroyCanvasRenderSurface } from './canvasRenderSurface';
import { destroyCanvasTextureResolvers } from './canvasTextureResolver';

export function createCanvasRenderState(
  surface: CanvasRenderSurface,
  pipeline: Readonly<CanvasPipeline>,
  canvasTextureResolvers: CanvasTextureResolvers,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: options.renderTransform ?? createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as CanvasRenderState;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  // canvas/context/contextAttributes are readonly handles on the entity; written once here at the
  // construction boundary.
  state.applyBlendMode = pipeline.registries.blendModeApplication ?? null;
  state.canvasCssFilterResolver = null;
  (state as { canvas: HTMLCanvasElement }).canvas = surface.canvas;
  (state as { context: CanvasRenderingContext2D }).context = surface.context;
  (state as { contextAttributes: CanvasRenderingContext2DSettings }).contextAttributes = surface.contextAttributes;
  (state as { pipeline: Readonly<CanvasPipeline> }).pipeline = pipeline;
  (state as { surface: CanvasRenderSurface }).surface = surface;

  const runtime = createCanvasRenderStateRuntime(pipeline, canvasTextureResolvers);
  state[EntityRuntimeKey] = runtime;
  // The state owns a resolution set and points its miss seam at its own emitter. The closure reads the
  // emitter at call time, so enabling the guards later still reports through it.
  runtime.canvasTextureResolvers.registryMiss = (registry, kind) => runtime.registryMiss?.(registry, kind);
  runtime.currentBlendMode = null;
  runtime.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  runtime.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';

  surface.context.imageSmoothingEnabled = runtime.imageSmoothingEnabled;
  surface.context.imageSmoothingQuality = runtime.imageSmoothingQuality;
  return state;
}

// Allocates the package-private 2D-canvas runtime for a CanvasRenderState. createCanvasRenderState
// attaches one to each state under EntityRuntimeKey and populates its fields;
// getCanvasRenderStateRuntime reads it back. The render path writes the returned object every frame,
// so the return is intentionally mutable (not Readonly).
export function createCanvasRenderStateRuntime(
  pipeline: Readonly<CanvasPipeline>,
  canvasTextureResolvers: CanvasTextureResolvers,
): CanvasRenderStateRuntime {
  const runtime = createRenderStateRuntime() as CanvasRenderStateRuntime;
  runtime.registries = { ...pipeline.registries };
  runtime.canvasTextureResolvers = canvasTextureResolvers;
  runtime.teardowns = [];
  return runtime;
}

export function destroyCanvasRenderState(state: CanvasRenderState): void {
  if (_destroyedStates.has(state)) return;
  _destroyedStates.add(state);
  const runtime = getCanvasRenderStateRuntime(state);
  for (const teardown of [...runtime.teardowns]) teardown(state);
  runtime.teardowns.length = 0;
  destroyRenderState(state);
  destroyCanvasTextureResolvers(runtime.canvasTextureResolvers);
  destroyCanvasRenderSurface(state.surface);
}

// Resolves the package-private 2D-canvas runtime attached to a CanvasRenderState. Mutable by design:
// the render path writes its fields every frame.
export function getCanvasRenderStateRuntime(state: CanvasRenderState): CanvasRenderStateRuntime {
  return state[EntityRuntimeKey] as CanvasRenderStateRuntime;
}

// The state's own resolution set, which a shape rasterizer on another backend can share so both resolve
// one Texture through one transcode cache.
export function getCanvasRenderStateTextureResolvers(state: CanvasRenderState): CanvasTextureResolvers {
  return getCanvasRenderStateRuntime(state).canvasTextureResolvers;
}

export function registerCanvasRenderStateTeardown(
  state: CanvasRenderState,
  teardown: (state: CanvasRenderState) => void,
): void {
  getCanvasRenderStateRuntime(state).teardowns.push(teardown);
}

const _destroyedStates = new WeakSet<CanvasRenderState>();
