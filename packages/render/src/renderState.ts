import { createEntity, createEntityRuntime } from '@flighthq/entity';
import type { RenderState, RenderStateRuntime } from '@flighthq/types';
import { BlendMode, EntityRuntimeKey } from '@flighthq/types';

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
  runtime.colorAdjustmentChannelMixingGuard = null;
  runtime.currentFrameId = 0;
  runtime.renderAdaptHook = null;
  runtime.renderProxyAdapterMap = new WeakMap();
  runtime.renderProxyMap = new WeakMap();
  runtime.rendererMap = new Map();
  runtime.rendererMapId = 0;
  runtime.tempStack = [];
  return runtime;
}

// Resolves the package-private machinery runtime attached to a RenderState. Mutable by design: the
// render path writes its fields every frame.
export function getRenderStateRuntime(state: RenderState): RenderStateRuntime {
  return state[EntityRuntimeKey] as RenderStateRuntime;
}
