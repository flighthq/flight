import { createMatrix } from '@flighthq/geometry/contract';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  destroyRenderState,
} from '@flighthq/render/contract';
import type {
  CanvasPipeline,
  CanvasRenderOptions,
  CanvasRenderState,
  CanvasRenderStateRuntime,
  CanvasTextureResolvers,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { destroyCanvasTextureResolvers } from './canvasTextureResolver';

// Takes no driver handle: a state is "how to draw" — the pipeline, the resolvers, the smoothing policy
// — while "where" is a render target that flows in at beginCanvasRenderPass. On this backend that
// separation is what lets one state draw to several canvases, since each canvas carries its own context.
export function createCanvasRenderState(
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

  state.applyBlendMode = pipeline.registries.blendModeApplication ?? null;
  state.canvasCssFilterResolver = null;
  (state as { pipeline: Readonly<CanvasPipeline> }).pipeline = pipeline;

  const runtime = createCanvasRenderStateRuntime(pipeline, canvasTextureResolvers);
  state[EntityRuntimeKey] = runtime;
  // The state owns a resolution set and points its miss seam at its own emitter. The closure reads the
  // emitter at call time, so enabling the guards later still reports through it.
  runtime.canvasTextureResolvers.registryMiss = (registry, kind) => runtime.registryMiss?.(registry, kind);
  runtime.currentAlpha = NaN;
  runtime.currentBlendMode = null;
  runtime.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  runtime.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';
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
  runtime.currentRenderTarget = null;
  runtime.passStack = [];
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

export function resolveCanvasTextureSmoothing(state: CanvasRenderState, magFilter: string): boolean {
  return state.allowSmoothing && !magFilter.startsWith('nearest');
}

export function setCanvasGlobalAlpha(state: CanvasRenderState, alpha: number): void {
  const runtime = getCanvasRenderStateRuntime(state);
  if (runtime.currentAlpha === alpha) return;
  runtime.currentAlpha = alpha;
  state.context.globalAlpha = alpha;
}

export function setCanvasImageSmoothing(state: CanvasRenderState, enabled: boolean): void {
  const runtime = getCanvasRenderStateRuntime(state);
  if (runtime.imageSmoothingEnabled === enabled) return;
  runtime.imageSmoothingEnabled = enabled;
  state.context.imageSmoothingEnabled = enabled;
}

const _destroyedStates = new WeakSet<CanvasRenderState>();
