import type { BlendMode } from './BlendMode';
import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectClipHooks, DisplayObjectMaskRenderer } from './DisplayObjectRenderer';
import type { Entity } from './Entity';
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
  readonly backgroundColorRGBA: number[];
  readonly backgroundColorString: string;
  readonly currentFrameID: number;
  currentMaskDepth: number;
  currentClipRectangleDepth: number;
  displayObjectClipHooks: DisplayObjectClipHooks | null;
  // Optional mask-resolution pass run by prepareDisplayObjectRender. Installed by
  // registerDisplayObjectMaskRenderer; left null (and tree-shaken away) when no mask renderer is
  // registered, so mask-free scenes carry neither the pass code nor its per-frame walk.
  displayObjectMaskPass: ((state: RenderState, source: DisplayObject) => void) | null;
  readonly displayObjectMaskRendererMap: Map<symbol, DisplayObjectMaskRenderer>;
  readonly displayObjectMaskRendererMapID: number;
  pixelRatio: number;
  readonly renderProxyAdapterMap: WeakMap<Renderable, RenderProxyAdapter>;
  readonly renderProxyMap: WeakMap<Renderable, RenderProxy>;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderTransform2D: Matrix | null;
  readonly rendererMap: Map<symbol, Renderer>;
  sceneGraphSyncPolicy: SceneGraphSyncPolicy;
  readonly rendererMapID: number;
  roundPixels: boolean;
  readonly tempStack: Renderable[];
}
