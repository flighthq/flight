import type { BlendMode } from './BlendMode';
import type { CanvasShapeCommand } from './CanvasShapeRegistry';
import type { Entity, EntityRuntime, Kind } from './Entity';
import type { Matrix } from './Matrix';
import type { Path } from './Path';
import type { PathMesh } from './PathMesh';
import type { KeyedTable } from './RegistryTable';
import type { Renderable } from './Renderable';
import type { RenderEffectPaddingResolver } from './RenderEffectPadding';
import type { Renderer } from './Renderer';
import type { RenderProxy } from './RenderProxy';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderProxyAdapter } from './RenderProxyAdapter';
import type { RenderRegistry, RenderRegistrySignals } from './RenderRegistrySignals';
import type { Scene2DClipHooks } from './Scene2DRenderer';
import type { StrokeStyle } from './StrokeStyle';

/**
 * Controls whether a subsystem refreshes derived scene graph state from raw
 * fields before use, or trusts invalidate* calls to mark stale derived state.
 *
 * Direct field writes such as `object.x = 10` require explicit invalidate*
 * calls when this policy is "requiresInvalidation".
 */
export type Scene3DGraphSyncPolicy = 'refreshDerivedState' | 'requiresInvalidation';

export interface RenderState extends Entity {
  allowSmoothing: boolean;
  readonly backgroundColor: number;
  readonly backgroundColorRgba: number[];
  readonly backgroundColorString: string;
  // Active clip nesting depth (rect + path). Masks were retired into clips, so the mask pass / renderer
  // map / currentMaskDepth are gone. Backends additionally keep their own per-form unwind stack.
  currentClipDepth: number;
  displayObjectClipHooks: Scene2DClipHooks | null;
  pixelRatio: number;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderTransform2D: Matrix | null;
  sceneGraphSyncPolicy: Scene3DGraphSyncPolicy;
  roundPixels: boolean;
}

// Pure registration policy shared by every render backend. Members remain optional when importing the
// corresponding registrar is optional, so an unwired base state carries no table metadata.
export interface RenderRegistries {
  canvasShapeCommands?: KeyedTable<CanvasShapeCommand>;
  effectPaddingResolvers?: KeyedTable<RenderEffectPaddingResolver>;
}

// Package-private machinery for a RenderState entity. Lives in the runtime tier (not on the entity)
// so the public RenderState surface stays minimal; the render path resolves it via
// getRenderStateRuntime. The four backend render-state runtimes extend this base, so the frame
// counter, proxy maps, and renderer registry are shared across every backend. Defined in
// @flighthq/types — the header layer — so out-of-package code can reach the same state.
export interface RenderStateRuntime extends EntityRuntime {
  // Opt-in color-adjustment accumulation seam. `enableColorAdjustments` installs the resolver that
  // copies a node's cached local value to its render proxy and composes it with its parent's value.
  // This is independent of colorAdjustmentUnsupportedGuard: enabling diagnostics never enables
  // rendering behavior, and leaving this null keeps adjustment/material math out of the base walk.
  colorAdjustmentResolver: ((state: RenderState, data: RenderProxy, parentData?: RenderProxy) => void) | null;
  // Shakeable diagnostics seam (default `null` → no cost): a non-matrix operation that neither the
  // compact scale/bias path nor the full 4×5 matrix path can represent reaches this slot.
  // `enableColorAdjustmentGuards` installs a handler that warns through @flighthq/log.
  colorAdjustmentUnsupportedGuard: ((state: RenderState, source: Renderable) => void) | null;
  currentFrameId: number;
  renderAdaptHook: ((state: RenderState, source: Renderable, data: RenderProxy2D) => void) | null;
  renderProxyAdapterMap: WeakMap<Renderable, RenderProxyAdapter>;
  renderProxyMap: WeakMap<Renderable, RenderProxy>;
  // WeakMap alone cannot support deterministic shutdown. This companion set contains exactly the
  // sources with live proxies so destroyRenderState can run every renderer's destroyData hook.
  renderProxySources: Set<Renderable>;
  // Opt-in, shakeable registry-miss seam. Core dispatch retains only this nullable callback; the
  // signal allocation/emission and warning policy live in the separately imported diagnostics lane.
  registryMiss:
    | (((registry: RenderRegistry, kind: Kind) => void) & {
        clear(): void;
        readonly signals: RenderRegistrySignals;
      })
    | null;
  registries: RenderRegistries;
  // Optional backend guard reached before a root walk. Backends use this to diagnose pipeline-policy
  // mistakes without adding their warning dependency to the substrate-independent render path.
  renderRootGuard: ((state: RenderState, root: Renderable) => void) | null;
  // The heavier closed-ring/self-intersection stroke kernel is explicitly enabled per state. The
  // default shape lane keeps its compact open-outline tessellator and rasterizes closed strokes.
  strokeTessellator:
    | ((path: Readonly<Path>, style: Readonly<StrokeStyle>, tolerance?: number) => PathMesh | null)
    | null;
  rendererMap: Map<Kind, Renderer>;
  rendererMapId: number;
  tempStack: Renderable[];
}
