import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { DisplayObjectClipHooks, DisplayObjectMaskRenderer } from './DisplayObjectRenderer';
import type { Entity } from './Entity';
import type { Matrix } from './Matrix';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RenderFeatures } from './RenderFeatures';
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
  readonly displayObjectMaskRendererMap: Map<symbol, DisplayObjectMaskRenderer>;
  readonly displayObjectMaskRendererMapID: number;
  pixelRatio: number;
  readonly renderProxyAdapterMap: WeakMap<Renderable, RenderProxyAdapter>;
  readonly renderProxyMap: WeakMap<Renderable, RenderProxy>;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderColorTransform: ColorTransform | null;
  renderFeatures: RenderFeatures;
  renderTransform2D: Matrix | null;
  readonly rendererMap: Map<symbol, Renderer>;
  sceneGraphSyncPolicy: SceneGraphSyncPolicy;
  readonly rendererMapID: number;
  roundPixels: boolean;
  readonly tempStack: Renderable[];
}
