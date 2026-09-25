import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  destroyRenderState,
} from '@flighthq/render/contract';
import type {
  CanvasRenderRegistries,
  CanvasRenderState,
  CanvasRenderStateOptions,
  CanvasRenderStateRuntime,
  CanvasTextureResolvers,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createCanvasTextureResolvers, destroyCanvasTextureResolvers } from './canvasTextureResolver.ts';

// Takes no driver handle: a state is "how to draw" — the pipeline, the resolvers, the smoothing policy
// — while "where" is a render target that flows in at beginCanvasRenderPass. On this backend that
// separation is what lets one state draw to several canvases, since each canvas carries its own context.
export function createCanvasRenderState(options: Readonly<CanvasRenderStateOptions> = {}): CanvasRenderState {
  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? 1,
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as CanvasRenderState;

  state.applyBlendMode = options.blendModeApplication ?? null;
  state.canvasCssFilterResolver = null;

  const registries = buildCanvasRenderRegistries(options);
  const canvasTextureResolvers = options.canvasTextureResolvers ?? createCanvasTextureResolvers(options.canvasHost!);
  const runtime = createCanvasRenderStateRuntime(registries, canvasTextureResolvers);
  if (options.canvasHost !== undefined) runtime.canvasHost = options.canvasHost;
  state[EntityRuntimeKey] = runtime;
  // The entity field is a read view of the SAME aggregate the runtime holds, as on GL and WGPU — not
  // the caller's object. Registrars replace tables on the runtime copy-on-write, so a field pointing
  // at a separate object would be frozen at construction: it would never observe a registration, and
  // the offscreen factories that derive a pipeline from it would snapshot an empty policy.
  (state as { registries: Readonly<CanvasRenderRegistries> }).registries = runtime.registries;
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
  registries: Readonly<CanvasRenderRegistries>,
  canvasTextureResolvers: CanvasTextureResolvers,
): CanvasRenderStateRuntime {
  const runtime = createRenderStateRuntime() as CanvasRenderStateRuntime;
  runtime.registries = cloneCanvasRenderRegistries(registries);
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

function buildCanvasRenderRegistries(options: Readonly<CanvasRenderStateOptions>): CanvasRenderRegistries {
  const out = {} as CanvasRenderRegistries;
  out.strokeTessellator = options.strokeTessellator ?? null;
  out.nodeRenderers = new Map(options.nodeRenderers);
  out.effects = new Map(options.effects);
  if (options.canvasShapeCommands !== undefined) out.canvasShapeCommands = new Map(options.canvasShapeCommands);
  if (options.effectPaddingResolvers !== undefined)
    out.effectPaddingResolvers = new Map(options.effectPaddingResolvers);
  if (options.materialRenderers !== undefined) out.materialRenderers = new Map(options.materialRenderers);
  if (options.colorAdjustments !== undefined) out.colorAdjustments = options.colorAdjustments;
  if (options.colorAdjustmentUnsupportedGuard !== undefined)
    out.colorAdjustmentUnsupportedGuard = options.colorAdjustmentUnsupportedGuard;
  if (options.renderRootGuard !== undefined) out.renderRootGuard = options.renderRootGuard;
  if (options.blendModeApplication !== undefined) out.blendModeApplication = options.blendModeApplication;
  return out;
}

// Copies every table out of the caller's aggregate so the state owns its own. The input is routinely a
// module-level frozen preset shared by every state on this backend, so a shallow spread would hand each
// state the preset's own Map objects — correct only for as long as every registrar stays copy-on-write,
// and silently global the first time one writes in place. Optional slots are copied only when present:
// field presence is what keeps every registries object one hidden class, so the per-shape reads on the
// draw path stay monomorphic.
function cloneCanvasRenderRegistries(registries: Readonly<CanvasRenderRegistries>): CanvasRenderRegistries {
  const out = { ...registries } as CanvasRenderRegistries;
  if (registries.canvasShapeCommands !== undefined) out.canvasShapeCommands = new Map(registries.canvasShapeCommands);
  if (registries.effectPaddingResolvers !== undefined)
    out.effectPaddingResolvers = new Map(registries.effectPaddingResolvers);
  if (registries.materialRenderers !== undefined) out.materialRenderers = new Map(registries.materialRenderers);
  out.effects = new Map(registries.effects);
  out.nodeRenderers = new Map(registries.nodeRenderers);
  return out;
}

const _destroyedStates = new WeakSet<CanvasRenderState>();
