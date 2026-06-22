import type { BlendMode } from './BlendMode';
import type { DisplayObjectClipHooks } from './DisplayObjectRenderer';
import type { Entity, EntityRuntime } from './Entity';
import type { Matrix } from './Matrix';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RenderProxy } from './RenderProxy';
import type { RenderProxyAdapter } from './RenderProxyAdapter';

/**
 * Controls whether a subsystem refreshes derived scene graph state from raw
 * fields before use, or trusts invalidate* calls to mark stale derived state.
 *
 * Direct field writes such as `object.x = 10` require explicit invalidate*
 * calls when this policy is "requiresInvalidation".
 */
export type SceneGraphSyncPolicy = 'refreshDerivedState' | 'requiresInvalidation';

export interface RenderState extends Entity {
  allowSmoothing: boolean;
  readonly backgroundColor: number;
  readonly backgroundColorRgba: number[];
  readonly backgroundColorString: string;
  // Active clip nesting depth (rect + path). Masks were retired into clips, so the mask pass / renderer
  // map / currentMaskDepth are gone. Backends additionally keep their own per-form unwind stack.
  currentClipDepth: number;
  displayObjectClipHooks: DisplayObjectClipHooks | null;
  pixelRatio: number;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderTransform2D: Matrix | null;
  sceneGraphSyncPolicy: SceneGraphSyncPolicy;
  roundPixels: boolean;
}

// Package-private machinery for a RenderState entity. Lives in the runtime tier (not on the entity)
// so the public RenderState surface stays minimal; the render path resolves it via
// getRenderStateRuntime. The four backend render-state runtimes extend this base, so the frame
// counter, proxy maps, and renderer registry are shared across every backend. Defined in
// @flighthq/types — the header layer — so out-of-package code can reach the same state.
export interface RenderStateRuntime extends EntityRuntime {
  currentFrameId: number;
  renderProxyAdapterMap: WeakMap<Renderable, RenderProxyAdapter>;
  renderProxyMap: WeakMap<Renderable, RenderProxy>;
  rendererMap: Map<symbol, Renderer>;
  rendererMapId: number;
  tempStack: Renderable[];
}
