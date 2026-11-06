import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { Matrix } from '@flighthq/geometry/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { SamplerLike, TextureColorSpace } from '@flighthq/texture/contract';

export interface CreateExternalTextureOptions {
  // Declares the borrowed handle's existing sample interpretation; the backend cannot reinterpret
  // or reallocate a caller-owned native texture.
  readonly colorSpace?: TextureColorSpace;
  readonly height: number;
  readonly sampler?: Readonly<SamplerLike>;
  readonly width: number;
}

/**
 * Backend-agnostic handle for a cached rendering. The user creates and holds a
 * RenderCache, attaches it to a scene node, and refreshes it when the cached
 * content changes. The actual backend resource (a CanvasRenderTarget,
 * GlTextureRenderTarget, etc.) is owned by the render state and keyed by this handle,
 * never stored on the handle itself — so one handle can back its own resource on
 * each state it is used with, and a handle with no resource composites to nothing.
 *
 * `transform` places the cached content back at the source's scene position when
 * composited (it accounts for the bounds origin and any padding used while baking).
 */
export interface RenderCache extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: RenderCacheKind;
  transform: Matrix;
}

export const RenderCacheKind = 'RenderCache';
export type RenderCacheKind = typeof RenderCacheKind;

export type RenderCacheAdapterSignals = {
  onPrepare: Signal<void>;
};

export type RenderCacheRefreshOptions = {
  // Extra transparent margin, in source pixels, baked around the content on every side.
  // Gives effects such as blur room to bleed without clipping at the target edge.
  padding?: number;
  minWidth?: number;
  minHeight?: number;
};

export interface RenderStateStats {
  readonly drawCallCount: number;
  readonly flushCount: number;
  readonly proxyVisitedCount: number;
}

// Explicit per-aspect clear values for a render target. Omitted aspects are untouched.
//
// Color values are linear float RGBA — the same representation clearBufferfv takes, covering the
// full range of sRGB and HDR (rgba16f/rgba32f) targets with no encoding step. Use `color` to
// broadcast one value to every color attachment, or `colors` for per-attachment control where
// undefined entries preserve that attachment. The two fields are mutually exclusive.
export interface RenderTargetClear {
  color?: readonly [number, number, number, number];
  colors?: ReadonlyArray<readonly [number, number, number, number] | undefined>;
  depth?: number;
  stencil?: number;
}

export interface Scene2DPipelineCoverageExplanation {
  registeredKinds: readonly Kind[];
  uncoveredKinds: readonly Kind[];
  unusedRegistrations: readonly Kind[];
  usedKinds: readonly Kind[];
}

// The single most-likely blank cause, root-cause prioritized: no-renderer > not-prepared >
// not-visible > zero-alpha > ok (see explainScene2DRender for why this ordering, not the literal
// buildRenderQueue check order).
export type Scene2DRenderBlankReason = 'no-renderer' | 'not-prepared' | 'not-visible' | 'zero-alpha' | 'ok';

// Plain-data answer to "why is this display object blank?", the pull half of the diagnostics
// convention: recomputed on demand from live render state, holding no reference to it. Every field is
// re-derived by reading the same seams the draw path reads, so an agent or test can assert on the
// cause without a human-readable string. Format for humans in a separate format* companion, never here.
export interface Scene2DRenderExplanation {
  readonly kind: Kind;
  // A renderer is registered for `kind` on this state (the getOrCreateRenderProxy2D / buildRenderQueue
  // lookup, re-run). False is the classic blank-on-a-new-backend bug: prepared and visible, but no
  // registerNodeRenderer(state, kind, renderer) for this kind, so buildRenderQueue never emits a draw.
  readonly hasRenderer: boolean;
  // A render proxy exists for `source`, i.e. prepareScene2DRender reached it. False when prepare
  // was never called, or an ancestor was disabled/hidden so the prepare walk stopped before this node.
  readonly prepared: boolean;
  // Effective visibility and alpha. When prepared these come off the proxy, which folds in the
  // appearance of every ancestor the prepare walk actually reached (recalculateAppearance), so a
  // partially-faded ancestor surfaces here as a reduced effectiveAlpha on the child. Note a fully
  // hidden or zero-alpha ancestor stops the walk before the child instead of folding through it, so
  // that child reads as prepared:false / not-prepared rather than not-visible. Before prepare there is
  // no proxy and no resolved parent chain, so these fall back to the node's own raw appearance fields
  // — best-effort values dominated by prepared:false.
  readonly visible: boolean;
  readonly effectiveAlpha: number;
  readonly reason: Scene2DRenderBlankReason;
}

export interface Scene3DPipelineCoverageExplanation {
  registeredKinds: readonly Kind[];
  registeredMaterialKinds: readonly Kind[];
  uncoveredKinds: readonly Kind[];
  uncoveredMaterialKinds: readonly Kind[];
  unusedMaterialRegistrations: readonly Kind[];
  unusedRegistrations: readonly Kind[];
  usedKinds: readonly Kind[];
  usedMaterialKinds: readonly Kind[];
}
