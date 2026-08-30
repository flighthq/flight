import type { BlendMode } from './BlendMode';
import type { ColorScaleBias } from './ColorScaleBias';
import type { Kind } from './Entity';
import type { GlCompressedTextureDecoder } from './GlCompressedTextureDecoder';
import type { GlCompressedTextureUploader } from './GlCompressedTextureUploader';
import type { GlContext } from './GlContext';
import type { GlContextRuntime } from './GlContextRuntime';
import type { GlContextState } from './GlContextState';
import type { GlCustomMaterialShaderSource } from './GlCustomMaterialShaderSource';
import type { GlMaterialRenderer } from './GlMaterialRenderer';
import type { GlMeshMaterialRenderer } from './GlMeshMaterialRenderer';
import type { GlModifierSnippet } from './GlModifierSnippet';
import type { GlPbrExtensionRegistration } from './GlPbrExtensionRegistration';
import type { GlPipeline } from './GlPipeline';
import type { GlRenderEffectRegistration } from './GlRenderEffectPipeline';
import type { GlRenderTarget } from './GlRenderTarget';
import type { GlRenderTextureGuard } from './GlRenderTexture';
import type { GlBitmapShader, GlShaderLocations } from './GlShaderLocations';
import type { GlShapeMesh } from './GlShapeMesh';
import type { GlTextureResolver } from './GlTextureResolver';
import type { GlVelocityWriter } from './GlVelocityWriter';
import type { Material } from './Material';
import type { KeyedTable, SlotTable } from './RegistryTable';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderRegistries, RenderState, RenderStateRuntime } from './RenderState';
import type { SamplerLike } from './Sampler';
import type { ShapeRasterizer } from './ShapeRasterizer';
import type { TintMaterialData } from './TintMaterialData';

export interface GlRenderState extends RenderState {
  applyBlendMode: ((state: GlRenderState, blendMode: BlendMode | null) => void) | null;
  readonly contextState: GlContextState;
  readonly gl: GlContext;
  readonly pipeline: GlPipeline;
}

// Pure registration policy owned by one WebGL render pipeline. Tables are persistent: a derived
// pipeline may initially share them, while either aggregate can later replace a member independently.
export interface GlRenderRegistries extends RenderRegistries {
  blendRealizations: KeyedTable<GlBlendRealization>;
  colorAdjustmentFeature?: SlotTable<GlColorAdjustmentMaterialFeature>;
  // Optional diagnostic policy stays separate from the rendering feature: binding this callback
  // reports an unwired feature but never enables color-adjustment rendering behavior.
  colorAdjustmentFeatureGuard?: SlotTable<GlColorAdjustmentMaterialFeatureGuard>;
  // Optional compressed-container policy. Both slots are empty until explicitly registered so
  // ordinary bitmap bundles retain neither the format table nor a fallback decoder.
  compressedTextureDecoder: SlotTable<GlCompressedTextureDecoder>;
  compressedTextureUpload: SlotTable<GlCompressedTextureUploader>;
  customEffectShaders: KeyedTable<string>;
  customMaterialShaders: KeyedTable<GlCustomMaterialShaderSource>;
  materialRenderers: KeyedTable<GlMaterialRenderer>;
  meshMaterialRenderers: KeyedTable<GlMeshMaterialRenderer>;
  modifierSnippets: KeyedTable<GlModifierSnippet>;
  // Shader cache identity advances with every snippet-table replacement, including same-kind
  // replacements whose define signature is unchanged but whose emitted source differs.
  modifierSnippetRevision: number;
  pbrExtensions: KeyedTable<GlPbrExtensionRegistration>;
  // Incremented whenever pbrExtensions is replaced. The compiled-program cache key includes this
  // revision so replacing a registration cannot reuse a shader compiled from the prior policy.
  pbrExtensionRevision: number;
  renderEffects: KeyedTable<GlRenderEffectRegistration>;
  shapeRasterizer: SlotTable<ShapeRasterizer>;
  textureResolvers: KeyedTable<GlTextureResolver>;
  velocityWriters: KeyedTable<GlVelocityWriter>;
}

// A WebGL fixed-function realization of a blend-mode intent, registered per render state against a
// BlendMode string. `src`/`dst` are the premultiplied-alpha blendFunc factors and `equation` is the
// blend equation (defaulting to additive FUNC_ADD when omitted). The factor/equation members are
// WebGL constant names resolved against the live context, keeping the descriptor plain data.
export interface GlBlendRealization {
  readonly src: GlBlendFactor;
  readonly dst: GlBlendFactor;
  readonly equation?: GlBlendEquation;
}

// Numeric WebGL state resolved from a semantic blend mode. Null in the runtime is reserved for an
// invalid shadow; normal blending is a real signature and can never collide with invalidation.
export interface GlBlendSignature {
  readonly dst: number;
  readonly equation: number;
  readonly src: number;
}

// The physically bound program and the bitmap locations that are valid for it. Programs such as
// fullscreen, clip, and mesh shaders carry null locations. This binding fact is deliberately not an
// ownership record: merely binding a caller-provided program never makes render-gl responsible for it.
export interface GlBoundShader {
  readonly locations: GlShaderLocations | null;
  readonly program: WebGLProgram;
}

export type GlBlendFactor = 'DST_COLOR' | 'ONE' | 'ONE_MINUS_SRC_ALPHA' | 'ONE_MINUS_SRC_COLOR' | 'ZERO';

export type GlBlendEquation = 'FUNC_ADD' | 'FUNC_REVERSE_SUBTRACT' | 'MAX' | 'MIN';

// The opt-in inline color-adjustment fold for the WebGL sprite/quad batch. Registered as persistent
// per-state policy by registerGlColorAdjustmentMaterialFeature; absent on a state that never opted in,
// so the base batch — which only ever reaches this through the optional registry slot — carries none of the fold's shader code
// and tree-shakes it out. `record` folds one instance's color adjustment into the active batch's
// promote-not-split state machine; `flush` uploads that state, selects the color-adjustment program,
// and binds it, returning true when it drew a folded batch (false when the batch had no adjustment, so
// the caller runs the lean material path). This is the generic capability seam — color adjustment is
// its first consumer; later pointwise adjustments (brightness/hue/…) realize through the same fold.
// `drawShapeMeshes` is the shape substrate's hook: the GPU-tessellated solid-fill path reaches it only
// through this optional registration when a node carries a color adjustment, so the base flat-color mesh shader
// stays free of any tint branch and the tinted mesh program tree-shakes out with the rest of the fold.
export interface GlColorAdjustmentMaterialFeature {
  // The one backend-authored pointwise color-remap implementation. Material-family compilers splice
  // this function into a promoted shader variant only when resolved adjustment data is present.
  // Keeping the source on the registered feature (rather than importing it from the base compiler)
  // preserves compile-time shake-out for applications that never register color adjustment.
  readonly fragmentShaderChunk: string;
  readonly matrixFragmentShaderChunk: string;
  drawShapeMeshes(state: GlRenderState, renderProxy: RenderProxy2D, meshes: readonly GlShapeMesh[]): void;
  flush(state: GlRenderState, count: number): boolean;
  record(
    runtime: GlRenderStateRuntime,
    colorScaleBias: ColorScaleBias | TintMaterialData | readonly number[] | null | undefined,
    instanceIndex: number,
  ): void;
}

export type GlColorAdjustmentMaterialFeatureGuard = (
  state: GlRenderState,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData | readonly number[]>,
) => void;

// Package-private GPU state for a GlRenderState entity. Lives in the runtime tier (not on the
// entity) so the public GlRenderState surface stays minimal; the render path resolves it each
// frame via getGlRenderStateRuntime. Defined in @flighthq/types — the header layer — so
// out-of-package custom renderers can reach the same state.
export interface GlRenderStateRuntime extends RenderStateRuntime {
  context: GlContextRuntime;
  registries: GlRenderRegistries;
  teardowns: ((state: GlRenderState) => void)[];
  // Opt-in dev guard: called where a draw path is about to TRUST a cached binding slot and skip the
  // rebind. Null in production, so the check costs nothing and the message lives in the guard module.
  bindingCacheGuard: ((state: GlRenderState, expectedProgram: WebGLProgram) => void) | null;
  // Optional owner-installed seam that drains queued draws before render-gl hands the context to a
  // foreign renderer. scene2d-gl installs its quad-batch writer flush lazily when a batch is first prepared;
  // render-gl reaches it only through this contract slot and therefore does not depend on scene2d-gl.
  flushPendingDraws?: ((state: GlRenderState) => void) | null;

  defaultBitmapShader: GlBitmapShader | null;
  particleInstanceData?: Float32Array;
  // Per-material-kind bitmap shader for the immediate (display-object) path. resolveGlShader
  // looks a node's shader up here by its material kind — the render path has no color-adjustment (or
  // any material-specific) knowledge; the material's shader and its registration own that.
  materialBitmapShaderMap?: Map<Kind, GlBitmapShader>;
  // Optional per-node shader-binding resolver. Installed by setGlShader; absent (and tree-shaken
  // with the binding map) until a custom shader is bound to a node.
  webglShaderBindingResolver?: (renderProxy: RenderProxy2D) => GlBitmapShader | undefined;
  quadBatchWriterBlendMode: BlendMode | null;
  // The active quad-batch writer material (flush key, compared by reference) and its resolved
  // renderer + per-instance float stride.
  quadBatchWriterMaterial: Material | null;
  quadBatchWriterMaterialRenderer: GlMaterialRenderer | null;
  quadBatchWriterMaterialFloats: number;
  quadBatchWriterMaterialData: Float32Array;
  quadBatchWriterCount: number;
  quadBatchWriterInstanceData: Float32Array;
  // Resolved backend handle plus the sampling/alpha metadata needed to restore its binding when the
  // deferred batch flushes. High-level Texture resolution stays in texture-using callers.
  quadBatchWriterTexture: WebGLTexture | null;
  quadBatchWriterSampler: SamplerLike | null;
  quadBatchWriterStraightAlpha: boolean;
  // Transitional sampling key for legacy atlas/image writers. A Texture carries its sampler directly.
  quadBatchWriterSmoothing: boolean | null;
  // Color-transform fold state for the active quad-batch writer. Mode 0 = no tint, 1 = one uniform
  // tint for the whole batch, 2 = per-instance tints. A batch promotes upward, never splits.
  quadBatchWriterColorScaleBiasMode?: number;
  quadBatchWriterUniformColorScaleBias?: ColorScaleBias | TintMaterialData | readonly number[] | null;
  quadBatchWriterColorScaleBiasData?: Float32Array;
  quadBatchWriterColorMatrixData?: Float32Array;
  quadBatchWriterColorTintData?: Uint32Array;
  // Per-clip unwind stack: the form of each pushed clip (scissor vs stencil contour) so popClip
  // un-installs the right gate.
  clipForms: ('rect' | 'contour')[];
  currentMaskDepth?: number;
  currentScissorRect?: GlScissorRect | null;
  currentFramebuffer: WebGLFramebuffer | null;
  currentRenderTarget?: GlRenderTarget | null;
  renderTargetViewport: GlViewportRect | null;
  glRenderTextureGuard?: GlRenderTextureGuard | null;
  quadVertexData: Float32Array;
  matrixArray: Float32Array;
  scissorStack?: GlScissorRect[];
}

export interface GlParticleShader {
  program: WebGLProgram;
  locCorner: number;
  locPos: number;
  locCosScale: number;
  locSinScale: number;
  locColor: number;
  locUvRect: number;
  locSize: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
  locStraightTextureAlpha: WebGLUniformLocation;
}

export interface GlQuadBatchShader {
  program: WebGLProgram;
  locCorner: number;
  locMatAB: number;
  locMatCD: number;
  locMatTXTY: number;
  locSize: number;
  locUvRect: number;
  locAlpha: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
  locStraightTextureAlpha: WebGLUniformLocation;
}

// Per-instance color adjustment shader: the quad-batch base layout (locations 0-6) plus two
// vec4 instance attributes (a_colorScale at location 7, a_colorBias at location 8) applied per-vertex.
export interface GlColorScaleBiasInstancedShader {
  program: WebGLProgram;
  locCorner: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
  locStraightTextureAlpha: WebGLUniformLocation;
}

// Per-batch color adjustment shader — the base quad-batch layout plus color-adjustment uniforms
// applied in the fragment shader. A distinct program from the lean base shader, selected only when a
// whole batch shares one tint, so the default pipeline carries no color-adjustment record.
export interface GlUniformColorScaleBiasShader {
  program: WebGLProgram;
  locCorner: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
  locStraightTextureAlpha: WebGLUniformLocation;
  locColorScale: WebGLUniformLocation;
  locColorBias: WebGLUniformLocation;
}

// Tinted solid-fill mesh shader — the flat-color mesh program plus color-adjustment uniforms
// (u_colorScale/u_colorBias) applied in the fragment scene2d, in unpremultiplied space, byte-for-byte with the
// quad-batch uniform path. A distinct program from the lean base mesh shader, compiled and reached
// only through the opt-in color-adjustment fold, so a shape that never tints carries none of it.
export interface GlShapeMeshColorScaleBiasShader {
  program: WebGLProgram;
  positionLocation: number;
  matrixLocation: WebGLUniformLocation | null;
  colorLocation: WebGLUniformLocation | null;
  colorScaleLocation: WebGLUniformLocation | null;
  colorBiasLocation: WebGLUniformLocation | null;
  colorMatrixLocations?: readonly (WebGLUniformLocation | null)[];
}

export interface GlScissorRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

// Effective viewport after a top-left-origin Viewport input has been intersected with its target.
// Stored in WebGL's bottom-left-origin coordinate system so viewport/scissor restoration is exact.
export interface GlViewportRect {
  height: number;
  width: number;
  x: number;
  y: number;
}
