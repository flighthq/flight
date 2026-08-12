import { createEntity, createEntityRuntime } from '@flighthq/entity/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type {
  ColorAdjustmentUnsupportedGuard,
  Renderable,
  RenderState,
  RenderStateRuntime,
} from '@flighthq/types/contract';
import { BlendMode, EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

export function createRenderState(obj?: Partial<RenderState>): RenderState {
  const state = createEntity({
    allowSmoothing: obj?.allowSmoothing ?? true,
    backgroundColor: obj?.backgroundColor ?? 0,
    backgroundColorRgba: obj?.backgroundColorRgba ?? [],
    backgroundColorString: obj?.backgroundColorString ?? '',
    currentClipDepth: obj?.currentClipDepth ?? 0,
    displayObjectClipHooks: obj?.displayObjectClipHooks ?? null,
    pixelRatio: obj?.pixelRatio ?? 1,
    renderAlpha: obj?.renderAlpha ?? 1,
    renderBlendMode: obj?.renderBlendMode ?? BlendMode.Normal,
    renderTransform2D: obj?.renderTransform2D ?? null,
    roundPixels: obj?.roundPixels ?? false,
    sceneGraphSyncPolicy: obj?.sceneGraphSyncPolicy ?? 'refreshDerivedState',
  }) as RenderState;
  state[EntityRuntimeKey] = createRenderStateRuntime();
  return state;
}

// Allocates the package-private machinery runtime for a RenderState: the frame counter, proxy maps,
// and renderer registry shared across every backend. createRenderState attaches one under
// EntityRuntimeKey; getRenderStateRuntime reads it back. Backend factories build their fuller runtime
// on top of this. The render path writes the returned object every frame, so the return is
// intentionally mutable (not Readonly).
export function createRenderStateRuntime(): RenderStateRuntime {
  const runtime = createEntityRuntime() as RenderStateRuntime;
  runtime.currentFrameId = 0;
  runtime.renderAdaptHook = null;
  runtime.renderProxyAdapterMap = new WeakMap();
  runtime.renderProxyMap = new WeakMap();
  runtime.renderProxySources = new Set();
  runtime.registryMiss = null;
  runtime.registries = {
    renderers: createKeyedTable('NodeRenderer', 'Unregistered'),
    strokeTessellator: createSlotTable('StrokeTessellator', 'Rasterize'),
  };
  runtime.rendererMapId = 0;
  runtime.tempStack = [];
  return runtime;
}

// Runs every live proxy's renderer teardown hook and clears the state-owned traversal bookkeeping.
// Backend destroy* functions call this before releasing their own state/context tiers.
export function destroyRenderState(state: RenderState): void {
  const runtime = getRenderStateRuntime(state);
  for (const source of [...runtime.renderProxySources]) disposeRenderProxyForShutdown(state, source);
  runtime.registryMiss?.clear();
  runtime.registryMiss = null;
  runtime.registries.effectPaddingResolvers = undefined;
  runtime.tempStack.length = 0;
}

export function getColorAdjustmentUnsupportedGuard(state: RenderState): ColorAdjustmentUnsupportedGuard | null {
  const entry = getRenderStateRuntime(state).registries.colorAdjustmentUnsupportedGuard?.entry;
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

// Resolves the package-private machinery runtime attached to a RenderState. Mutable by design: the
// render path writes its fields every frame.
export function getRenderStateRuntime(state: RenderState): RenderStateRuntime {
  return state[EntityRuntimeKey] as RenderStateRuntime;
}

function disposeRenderProxyForShutdown(state: RenderState, source: Renderable): void {
  const runtime = getRenderStateRuntime(state);
  const proxy = runtime.renderProxyMap.get(source);
  if (proxy?.rendererData !== null && proxy?.rendererData !== undefined) {
    proxy.renderer?.destroyData?.(state, proxy.rendererData);
  }
  runtime.renderProxyMap.delete(source);
  runtime.renderProxySources.delete(source);
}
