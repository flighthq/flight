import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import type {
  ColorAdjustmentUnsupportedGuard,
  RenderState,
  RenderStateRuntime,
  NodeAny,
  EntityConstruction,
} from '@flighthq/types/contract';
import { BlendMode, EntityRuntimeKey } from '@flighthq/types/contract';

export function createRenderState(obj?: Partial<RenderState>): RenderState {
  const state = allocateEntity<RenderState>();
  initializeRenderState(state, obj);
  return finishEntity(state);
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
    nodeRenderers: new Map(),
    // Written as null rather than left off: the field's presence is what keeps every registries object
    // one hidden class, so the per-shape reads on the draw path stay monomorphic. The opt-in registrar
    // fills the slot; nothing allocates a table for a state that never opts in.
    strokeTessellator: null,
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
  return getRenderStateRuntime(state).registries.colorAdjustmentUnsupportedGuard ?? null;
}

// Resolves the package-private machinery runtime attached to a RenderState. Mutable by design: the
// render path writes its fields every frame.
export function getRenderStateRuntime(state: RenderState): RenderStateRuntime {
  return state[EntityRuntimeKey] as RenderStateRuntime;
}

export function initializeRenderState(state: EntityConstruction<RenderState>, obj?: Partial<RenderState>): void {
  state.allowSmoothing = obj?.allowSmoothing ?? true;
  state.currentClipDepth = obj?.currentClipDepth ?? 0;
  state.displayObjectClipHooks = obj?.displayObjectClipHooks ?? null;
  state.pixelRatio = obj?.pixelRatio ?? 1;
  state.canvasHost = obj?.canvasHost ?? null;
  state.imageHost = obj?.imageHost ?? null;
  state.renderAlpha = obj?.renderAlpha ?? 1;
  state.renderBlendMode = obj?.renderBlendMode ?? BlendMode.Normal;
  state.roundPixels = obj?.roundPixels ?? false;
  state.sceneGraphSyncPolicy = obj?.sceneGraphSyncPolicy ?? 'refreshDerivedState';
  state[EntityRuntimeKey] = createRenderStateRuntime();
}

function disposeRenderProxyForShutdown(state: RenderState, source: NodeAny): void {
  const runtime = getRenderStateRuntime(state);
  const proxy = runtime.renderProxyMap.get(source);
  if (proxy?.rendererData !== null && proxy?.rendererData !== undefined) {
    proxy.renderer?.destroyData?.(state, proxy.rendererData);
  }
  runtime.renderProxyMap.delete(source);
  runtime.renderProxySources.delete(source);
}
