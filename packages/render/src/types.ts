import type { ColorScaleBias } from '@flighthq/adjustments/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { Matrix, Matrix3, Matrix4, Vector2Like } from '@flighthq/geometry/contract';
import type { HostImageCapability } from '@flighthq/image/contract';
import type { Scene3DLightBlock } from '@flighthq/lighting/contract';
import type { BlendMode, Material, Material2D, Material3D, MaterialData } from '@flighthq/materials/contract';
import type { InstancedMesh, Mesh, MeshSubset } from '@flighthq/meshgeometry/contract';
import type { NodeAny, RendererData } from '@flighthq/node/contract';
import type { Path, PathMesh, StrokeStyle } from '@flighthq/path/contract';
import type { RequirementFacet } from '@flighthq/requirement/contract';
import type { Node2D } from '@flighthq/scene2d/contract';
import type { ShapeCommandToken } from '@flighthq/shape/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { HostCanvasCapability } from '@flighthq/surface/contract';
import type {
  ExternalTextureSourceKind,
  RenderTargetTextureSourceKind,
  SamplerLike,
  Texture2D,
  TextureColorSpace,
  TextureSource,
} from '@flighthq/texture/contract';
import type { CanvasShapeCommand } from '@flighthq/types/contract';

// Identifies which geometry accumulation pipeline a renderer submits into. This is the first
// component of the flush key: (BatchFormat, texture, blend, material). Consecutive draws that
// share the same key coalesce in the open batch; a key change or a BatchBarrier forces a flush.
//
// Quad:         Instanced textured-quad path. One instance = implicit four-vertex quad with
//               per-instance transform, UV rect, and alpha. Used by sprites, bitmaps, glyphs,
//               video frames — anything that maps a rectangular region of a texture onto a quad.
//
// VertexStream: Explicit vertex + index buffer path. Geometry arrives as a vertex/index stream
//               rather than as quad instances. Used by shapes, gradients, and scale-9 geometry.
//               Named VertexStream rather than Mesh to avoid collision with 3D mesh assets when
//               the world package gains real 3D geometry.
export enum BatchFormat {
  Quad,
  VertexStream,
}

export interface CreateExternalTextureOptions {
  // Declares the borrowed handle's existing sample interpretation; the backend cannot reinterpret
  // or reallocate a caller-owned native texture.
  readonly colorSpace?: TextureColorSpace;
  readonly height: number;
  readonly sampler?: Readonly<SamplerLike>;
  readonly width: number;
}

// Construction options for a render-target 2D Texture. Target allocation stays lazy and backend-owned;
// sampling and UV fields remain ordinary Texture state.
export interface CreateRenderTextureOptions {
  readonly colorSpace?: TextureColorSpace;
  readonly colorAttachments?: number;
  readonly colorFormats?: ReadonlyArray<RenderTargetFormat>;
  readonly depth?: RenderTargetDepth;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly format?: RenderTargetFormat;
  readonly height: number;
  readonly sampleCount?: number;
  readonly sampler?: Readonly<SamplerLike>;
  readonly uvOffset?: Readonly<Vector2Like>;
  readonly uvRotation?: number;
  readonly uvScale?: Readonly<Vector2Like>;
  readonly width: number;
}

/**
 * A foreign GPU texture bound by one render backend. The backend borrows and never uploads or owns
 * the associated GPU handle.
 */
// Per-side capture padding an effect needs beyond its source bounds, in local pixels. Render owns the
// shape because offscreen target allocation consumes it; effect kinds register the resolver.
export interface EffectPadding {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

// Resolves the padding for one effect intent. The parameter is the structural effect base (an entity
// with a kind) so Render, which `@flighthq/effects` depends on, never imports the effects contract.
export type EffectPaddingResolver = (effect: Readonly<EffectPaddingSubject>) => Readonly<EffectPadding>;

export interface ExternalTexture extends TextureSource {
  readonly kind: typeof ExternalTextureSourceKind;
}

export interface RenderBlendStateEntry {
  readonly alpha: number;
  readonly blendMode: BlendMode | null;
}

export interface RenderBatchKey {
  readonly blend: BlendMode | null;
  readonly format: BatchFormat;
  readonly material: Material | null;
  readonly rendererKind: Kind;
  readonly texture: object | null;
}

export interface RenderDrawContext {
  drawCallCount: number;
  flushCount: number;
  openBatchKey: RenderBatchKey | null;
  proxyVisitedCount: number;
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

export interface NodeRenderer {
  // Declares which geometry accumulation pipeline this renderer submits into. When set, the
  // render walk can flush automatically on format changes instead of each immediate-draw renderer
  // flushing manually. Absent means the renderer manages its own flush boundaries.
  format?: BatchFormat;
  createData(state: RenderState, source: NodeAny): RendererData | null;
  // Frees any non-GC resource this renderer allocated into `data` (GPU textures, framebuffers).
  // Called when the proxy's renderer/data is replaced or the proxy is destroyed. Optional: renderers
  // whose data holds only GC-managed values (or none) omit it. `destroy*` semantics — frees now.
  destroyData?(state: RenderState, data: RendererData): void;
  // Kind-owned identity check reached through the already-selected renderer before a
  // requiresInvalidation prepare can skip the node. Implementations keep their comparison stamp in
  // rendererData, which is per-node and per-state; absent renderers retain the revision-only path.
  isDirty?(state: RenderState, source: NodeAny, data: RendererData | null): boolean;
  submit(state: RenderState, node: RenderProxy): void;
}

export interface RenderProxy extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  source: NodeAny;
  kind: Kind;
  next: RenderProxy | null;

  alpha: number;
  appearanceFrameId: number;
  blendMode: BlendMode | null;
  // The node's color-adjustment stack resolved to the affine form the inline fold consumes.
  colorScaleBias: ColorScaleBias | null;
  // Full inherited 4x5 pointwise matrix for the uncommon channel-mixing path.
  colorMatrix?: Readonly<Float32Array> | null;
  material: Material | null;
  materialData: MaterialData | null;
  lastAppearanceId: number;
  lastChildrenId: number;
  lastLocalContentId: number;
  lastLocalTransformId: number;
  lastParentReferenceId: number;
  name: string | null;
  renderer: NodeRenderer | null;
  rendererData: RendererData | null;
  rendererDataSource: NodeAny | null;
  rendererMapId: number;
  transformFrameId: number;
  visible: boolean;
}

// The unified 2D render node. Sprites and display objects share one render node type; the clip field is
// inert for nodes that do not use it.
export interface RenderProxy2D extends RenderProxy {
  material: Material2D | null;
  source: Node2D;
  transform2D: Matrix;
  traverseChildren: boolean;
  clipDepth: number;
}

export type RenderProxyAdapter = {
  adapt: (state: RenderState, source: NodeAny, node: RenderProxy2D) => boolean | null;
};

export type RenderProxyResolver = {
  resolve: (state: RenderState, source: Node2D, node: RenderProxy2D) => boolean | null;
};

// Per-node update callback for the render walks.
export type RenderProxyVisitor = (
  state: RenderState,
  source: NodeAny,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
) => void;

export type RenderSortKey = number;

export interface RenderQueueEntry {
  readonly proxy: RenderProxy;
  readonly sortKey: RenderSortKey;
}

export interface RenderQueue extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  entries: RenderQueueEntry[];
  entryCount: number;
}

// An Entity like every other object a create* factory returns, so it can carry runtime state on the
// standard slot instead of growing fields on the public shape.
export type RenderCacheAdapter = EntityRaw & { [EntityRuntimeKey]: EntityRuntime | undefined } & RenderProxyAdapter & {
    cache: RenderCache | null;
    signals: RenderCacheAdapterSignals | null;
  };

export interface Scene2DRenderer extends NodeRenderer {
  createData(state: RenderState, source: Node2D): RendererData | null;
  submit(state: RenderState, node: RenderProxy2D): void;
}

export interface Scene2DClipHooks {
  finalize(state: RenderState): void;
  popClip(state: RenderState, data: RenderProxy2D, source: Node2D): void;
  pushClip(state: RenderState, data: RenderProxy2D, source: Node2D): void;
}

/** Controls whether a subsystem refreshes derived scene graph state from raw fields before use. */
export type Scene3DGraphSyncPolicy = 'refreshDerivedState' | 'requiresInvalidation';

export interface RenderState extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  allowSmoothing: boolean;
  currentClipDepth: number;
  displayObjectClipHooks: Scene2DClipHooks | null;
  pixelRatio: number;
  canvasHost: Readonly<HostCanvasCapability> | null;
  imageHost: Readonly<HostImageCapability> | null;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  sceneGraphSyncPolicy: Scene3DGraphSyncPolicy;
  roundPixels: boolean;
}

export interface RenderRegistries {
  canvasShapeCommands?: ReadonlyMap<Kind, CanvasShapeCommand>;
  colorAdjustments?: ((state: RenderState, data: RenderProxy, parentData?: RenderProxy) => void) | null;
  colorAdjustmentUnsupportedGuard?: ColorAdjustmentUnsupportedGuard | null;
  effectPaddingResolvers?: ReadonlyMap<Kind, EffectPaddingResolver>;
  nodeRenderers: ReadonlyMap<Kind, NodeRenderer>;
  renderRootGuard?: RenderRootGuard | null;
  strokeTessellator: StrokeTessellator | null;
}

export type ColorAdjustmentUnsupportedGuard = (state: RenderState, source: NodeAny) => void;
export type RenderRootGuard = (state: RenderState, root: NodeAny) => void;

export type StrokeTessellator = (
  path: Readonly<Path>,
  style: Readonly<StrokeStyle>,
  tolerance?: number,
) => PathMesh | null;

export interface RenderStateRuntime extends EntityRuntime {
  currentFrameId: number;
  renderAdaptHook: ((state: RenderState, source: NodeAny, data: RenderProxy2D) => void) | null;
  renderProxyAdapterMap: WeakMap<NodeAny, RenderProxyAdapter>;
  renderProxyMap: WeakMap<NodeAny, RenderProxy>;
  renderProxySources: Set<NodeAny>;
  registryMiss:
    | (((registry: RenderRegistryTable, kind: Kind) => void) & {
        clear(): void;
        readonly signals: RenderRegistrySignals;
      })
    | null;
  registries: RenderRegistries;
  rendererMapId: number;
  tempStack: NodeAny[];
}

export interface RenderStateOptions {
  canvasShapeCommands?: ReadonlyMap<Kind, CanvasShapeCommand>;
  colorAdjustments?: ((state: RenderState, data: RenderProxy, parentData?: RenderProxy) => void) | null;
  colorAdjustmentUnsupportedGuard?: ColorAdjustmentUnsupportedGuard | null;
  effectPaddingResolvers?: ReadonlyMap<Kind, EffectPaddingResolver>;
  nodeRenderers?: ReadonlyMap<Kind, NodeRenderer>;
  renderRootGuard?: RenderRootGuard | null;
  strokeTessellator?: StrokeTessellator | null;
}

// Replays a shape command stream into a 2D context for a backend that cannot express every fill as
// GPU geometry.
export type ShapeRasterizer = (
  context: CanvasRenderingContext2D,
  commands: readonly ShapeCommandToken[],
  state: RenderState,
) => void;

// Substrate-agnostic render-target description. A target carries axes, not booleans: `format`/
// `colorFormats` unlock HDR and the G-buffer, `colorAttachments` is MRT/deferred, `sampleCount` is
// MSAA, `depth` carries target-scope stencil and (for '-sampled') a readable depth texture. The
// per-backend target types (GlRenderTarget, WgpuRenderTarget) realize these axes; each splits into a
// screen realization (the swap chain) and a texture realization (GlTextureRenderTarget,
// WgpuTextureRenderTarget — sampleable offscreen storage).

// Common allocation-backed target identity used by backend-neutral assemblies. Backend target types
// extend this with their storage handles and effective format axes.
export interface RenderTargetDimensions {
  height: number;
  width: number;
}

export type RenderTargetFormat = 'rgba8' | 'rgba16f' | 'rgba32f';

// Allocation policy for a requested color format. 'preferred' permits a backend to select a
// renderable fallback and report it through effective axes; 'required' refuses substitution.
export type RenderTargetFormatPolicy = 'preferred' | 'required';

export type RenderTargetDepth = 'none' | 'depth-stencil' | 'depth-stencil-sampled';

// Color space of the pixels a target holds — a declared property of the target, NOT inferred from
// `format` ('rgba16f' can hold either linear HDR scene radiance or already-sRGB 2D content). 'linear'
// content (scene-gl materials output linear) must be sRGB-encoded once at present; 'srgb' content (2D
// display-object colors, already encoded) is presented as-is. The present step reads this to decide
// whether to run the linear->sRGB OETF, so gamma is neither double-applied nor skipped.
export type RenderTargetColorSpace = 'linear' | 'srgb';

// Canonical storage axes after descriptor defaults and substrate-independent normalization are
// resolved. A backend starts from this shape, then records any device-driven substitutions on its
// realized target rather than silently treating the requested descriptor as effective storage.
export interface RenderTargetAxes {
  readonly width: number;
  readonly height: number;
  readonly format: RenderTargetFormat;
  readonly colorAttachments: number;
  readonly colorFormats: ReadonlyArray<RenderTargetFormat>;
  readonly sampleCount: number;
  readonly depth: RenderTargetDepth;
  readonly colorSpace: RenderTargetColorSpace;
}

export interface RenderTargetAxisDifference {
  readonly axis: keyof RenderTargetAxes;
  readonly effective: RenderTargetAxes[keyof RenderTargetAxes];
  readonly requested: RenderTargetAxes[keyof RenderTargetAxes];
}

export interface RenderTargetExplanation {
  readonly differences: ReadonlyArray<RenderTargetAxisDifference>;
  readonly effective: Readonly<RenderTargetAxes>;
  readonly requested: Readonly<RenderTargetAxes>;
}

export interface RenderTargetDescriptor {
  width: number;
  height: number;
  // Color attachment 0 format. Default 'rgba8'. 'rgba16f'/'rgba32f' give HDR headroom for bloom and
  // are the float formats a future G-buffer uses.
  format?: RenderTargetFormat;
  // Number of color attachments (MRT). Default 1. >1 is the deferred-shading / G-buffer path.
  colorAttachments?: number;
  // Per-attachment format override when colorAttachments > 1; index 0 falls back to `format`.
  colorFormats?: ReadonlyArray<RenderTargetFormat>;
  // MSAA sample count. Default 1 (no MSAA). 2 | 4 | 8 — clamped to the device max.
  sampleCount?: number;
  // Depth/stencil attachment. Default 'none'. 'depth-stencil-sampled' additionally exposes the depth
  // as a sampleable texture for depth-dependent effects (SSAO, depth-of-field, fog).
  depth?: RenderTargetDepth;
  // Color space of the content the target will hold. Default 'srgb' (existing callers + all 2D are
  // unchanged: presented as-is). Producers of linear content (the 3D scene path) declare 'linear' so
  // the present applies the single sRGB encode.
  colorSpace?: RenderTargetColorSpace;
}

// GPU-owned TextureSource descriptor. A render backend realizes this request lazily in the state that
// first renders into or samples its owning RenderTexture.
export interface RenderTarget extends RenderTargetDescriptor, TextureSource {
  readonly kind: typeof RenderTargetTextureSourceKind;
}

// A descriptor with every default resolved. Backend realizations start from this shape and apply
// only device capability substitutions.
export interface ResolvedRenderTargetDescriptor extends RenderTargetAxes {}

export interface RenderTexture extends Texture2D {
  source: RenderTarget;
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

// The per-draw resolved record drawScene3D hands one mesh-material renderer for a single Mesh subset.
// The proxy is a reused scratch record owned by drawScene3D, valid only for the duration of the draw
// call it is passed to; a renderer must not retain it.
export interface Scene3DRenderProxy {
  alpha?: number;
  colorScaleBias?: Readonly<ColorScaleBias> | null;
  colorMatrix?: Readonly<Float32Array> | null;
  instanceCount?: number;
  instanceMatrices?: Readonly<Float32Array> | null;
  instanceColors?: Readonly<Float32Array> | null;
  jointMatrices?: Readonly<Float32Array> | null;
  normalMatrices?: Readonly<Float32Array> | null;
  material: Readonly<Material3D>;
  normalMatrix: Readonly<Matrix3>;
  subset: Readonly<MeshSubset>;
  worldMatrix: Readonly<Matrix4>;
}

// Numeric registry identifiers keep diagnostic policy and human-readable messages out of render core.
// Guard modules translate these values only after the opt-in signal seam is enabled. The values are
// assigned by declaration order and nothing persists them, so members stay alphabetized and emitters
// name the member rather than its number — a literal at a callsite would silently mean a different
// registry the moment one is inserted above it.
export enum RenderRegistryTable {
  BlendRealization,
  EffectPaddingResolver,
  MaterialRenderer,
  MaterialTextureLister,
  ModifierSnippet,
  NodeRenderer,
  ShapeCommandHandler,
  ShapeRasterizer,
  TextureResolver,
}

export interface RenderRegistriesMiss {
  readonly kind: Kind;
  readonly registry: RenderRegistryTable;
}

export interface RenderRegistriesMissExplanation {
  readonly misses: readonly Readonly<RenderRegistriesMiss>[];
  readonly status: 'complete' | 'misses-recorded';
}

export interface RenderRegistrySignals {
  onRegistryMiss: Signal<readonly [RenderRegistryTable, Kind]>;
}

// One public registration call that can satisfy a catalog entry. Registrations are ordered: the first
// one is the primary remedy surfaced by SceneCoverageEntry, while diagnostics may show the full list.
export interface CatalogRegistration {
  readonly module: string;
  readonly registrar: string;
}

// Consumer-shaped ownership data. Producers discover or generate these rows, but diagnostics define
// their stable shape so a different inventory instrument does not change every explain* signature.
export interface CatalogEntry {
  readonly kind: Kind;
  readonly registrations: readonly CatalogRegistration[];
  readonly registry: RenderRegistryTable;
}

// A caller supplies the complete catalog for the backend being explained. It stays data rather than a
// lookup object so generated, probed, and caller-authored inventories are interchangeable producers.
export type SceneCoverageCatalog = readonly CatalogEntry[];

// How well a kind the scene uses is served by the registry that would have to serve it. States are
// distinguished by remedy, not by why the state arose: Unregistered and FallbackRemediable name a call
// that can improve the result; Unavailable and FallbackUnavailable prove that no such call exists.
export const SceneCoverage = {
  FallbackRemediable: 'FallbackRemediable',
  FallbackUnavailable: 'FallbackUnavailable',
  Satisfied: 'Satisfied',
  Unavailable: 'Unavailable',
  Unregistered: 'Unregistered',
} as const;

export type SceneCoverage = (typeof SceneCoverage)[keyof typeof SceneCoverage];

// One kind a scene uses, paired with how well its consumer is wired for it. Shared by the 2D and 3D
// seams: nothing about a coverage verdict differs by dimension. The answer half of the seam
// whose question half is Scene2DKindUsage or Scene3DKindUsage: a scene reports the kinds, and the package holding the
// registry reports what it can and cannot serve.
//
// The explain tier reports EVERY requirement, satisfied ones included, so one call is a complete
// manifest a caller can render as a checklist. Reporting only the gaps would leave "covered"
// indistinguishable from "never asked about", which is the question an agent wiring up a document most
// needs answered. The boolean tier stays gap-only — see the has* functions.
//
// `registry` reuses RenderRegistryTable so an entry is comparable with the misses
// `explainRenderRegistriesMisses` records after the fact — the same vocabulary, asked before the frame
// instead of after it.
interface SceneCoverageEntryBase {
  readonly facet: RequirementFacet;
  readonly kind: Kind;
  readonly registry: RenderRegistryTable;
}

interface SceneCoverageRemedy {
  readonly module: string;
  readonly registrar: string;
}

export interface SatisfiedSceneCoverageEntry extends SceneCoverageEntryBase {
  readonly coverage: typeof SceneCoverage.Satisfied;
}

export interface UnregisteredSceneCoverageEntry extends SceneCoverageEntryBase, SceneCoverageRemedy {
  readonly coverage: typeof SceneCoverage.Unregistered;
}

export interface UnavailableSceneCoverageEntry extends SceneCoverageEntryBase {
  readonly coverage: typeof SceneCoverage.Unavailable;
}

export interface FallbackRemediableSceneCoverageEntry extends SceneCoverageEntryBase, SceneCoverageRemedy {
  readonly coverage: typeof SceneCoverage.FallbackRemediable;
}

export interface FallbackUnavailableSceneCoverageEntry extends SceneCoverageEntryBase {
  readonly coverage: typeof SceneCoverage.FallbackUnavailable;
}

// The remedy-bearing variants require both fields while the no-action variants expose neither. A
// switch on `coverage` therefore narrows whether a repair call can be rendered without nullable pairs.
export type SceneCoverageEntry =
  | FallbackRemediableSceneCoverageEntry
  | FallbackUnavailableSceneCoverageEntry
  | SatisfiedSceneCoverageEntry
  | UnavailableSceneCoverageEntry
  | UnregisteredSceneCoverageEntry;

// The prepared, render-ready frame produced by prepareScene3DRender and consumed by the backend
// drawScene3D. prepareScene3DRender walks the scene once per frame — propagating world transforms,
// computing the camera view-projection, frustum-culling, and packing lights — and leaves only
// the work the backend cannot do without a GPU context (uploading buffers, binding, drawing).
//
// `visibleMeshes` is the subset of the scene's Mesh nodes whose world-space bounds intersect the
// camera frustum, in scene-graph (front-to-back-agnostic) order; their world matrices are resolved
// on the node runtime (HasTransform3DRuntime.worldMatrix4). `viewProjection` is projection × view
// for the draw camera. `lights` is the packed light environment. `meshCount` is the live length of
// `visibleMeshes` — the array is a reused scratch buffer owned by the producer that may be longer
// than the visible count, so consumers must iterate to `meshCount`, not `visibleMeshes.length`.
//
// The list is reused scratch owned by the render state across frames; a consumer must not retain
// it past the drawScene3D it is passed to.
export interface Scene3DRenderList {
  instancedMeshCount: number;
  lights: Readonly<Scene3DLightBlock>;
  meshCount: number;
  viewProjection: Readonly<Matrix4>;
  visibleInstancedMeshes: InstancedMesh[];
  visibleMeshes: Mesh[];
}

interface EffectPaddingSubject extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: Kind;
}
