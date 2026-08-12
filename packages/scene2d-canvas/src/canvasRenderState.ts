import { createMatrix } from '@flighthq/geometry/contract';
import { createKeyedTable } from '@flighthq/registry/contract';
import {
  copyRenderStateRegistrations,
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  destroyRenderState,
  setRenderStateBackgroundColor,
} from '@flighthq/render/contract';
import type {
  CanvasRenderOptions,
  CanvasRenderState,
  CanvasRenderStateRuntime,
  CanvasTextureResolvers,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createCanvasTextureResolvers } from './canvasTextureResolver';

// Explicit snapshot re-copy for policy that is meaningful to a derived Canvas pipeline. Resource
// caches remain state-local. Mutable legacy maps are cloned; persistent tables may share immutable
// snapshots through distinct aggregates, so later replacements still diverge between render states.
export function copyCanvasRenderStateRegistrations(target: CanvasRenderState, source: CanvasRenderState): void {
  const targetRuntime = getCanvasRenderStateRuntime(target);
  const sourceRuntime = getCanvasRenderStateRuntime(source);
  target.applyBlendMode = source.applyBlendMode;
  target.canvasCssFilterResolver = source.canvasCssFilterResolver;
  targetRuntime.canvasTextureResolvers.registry = copyMap(sourceRuntime.canvasTextureResolvers.registry);
  targetRuntime.registries = {
    materialRenderers: sourceRuntime.registries.materialRenderers,
    renderEffects: sourceRuntime.registries.renderEffects,
    renderers: targetRuntime.registries.renderers,
  };
  copyRenderStateRegistrations(target, source);
}

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
  state.canvasCssFilterResolver = null;
  (state as { canvas: HTMLCanvasElement }).canvas = canvas;
  (state as { context: CanvasRenderingContext2D }).context = context;
  (state as { contextAttributes: CanvasRenderingContext2DSettings }).contextAttributes = context.getContextAttributes();

  const runtime = createCanvasRenderStateRuntime();
  state[EntityRuntimeKey] = runtime;
  // The state owns a resolution set and points its miss seam at its own emitter. The closure reads the
  // emitter at call time, so enabling the guards later still reports through it.
  runtime.canvasTextureResolvers = createCanvasTextureResolvers();
  runtime.canvasTextureResolvers.registryMiss = (registry, kind) => runtime.registryMiss?.(registry, kind);
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
  const runtime = createRenderStateRuntime() as CanvasRenderStateRuntime;
  runtime.registries = {
    renderEffects: createKeyedTable('CanvasRenderEffect', 'Unregistered'),
    renderers: runtime.registries.renderers,
  };
  return runtime;
}

export function destroyCanvasRenderState(state: CanvasRenderState): void {
  destroyRenderState(state);
}

// Resolves the package-private 2D-canvas runtime attached to a CanvasRenderState. Mutable by design:
// the render path writes its fields every frame.
export function getCanvasRenderStateRuntime(state: CanvasRenderState): CanvasRenderStateRuntime {
  return state[EntityRuntimeKey] as CanvasRenderStateRuntime;
}

function copyMap<K, V>(source: ReadonlyMap<K, V> | null | undefined): Map<K, V> | undefined {
  return source === null || source === undefined ? undefined : new Map(source);
}

// The state's own resolution set, which a shape rasterizer on another backend can share so both resolve
// one Texture through one transcode cache.
export function getCanvasRenderStateTextureResolvers(state: CanvasRenderState): CanvasTextureResolvers {
  return getCanvasRenderStateRuntime(state).canvasTextureResolvers;
}
