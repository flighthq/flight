import type { BlendMode } from './BlendMode';
import type { ColorScaleBias } from './ColorScaleBias';
import type { Kind } from './Entity';
import type { ExternalTexture } from './ExternalTexture';
import type { GlCompressedTextureDecoder } from './GlCompressedTextureDecoder';
import type { GlCompressedTextureUploader } from './GlCompressedTextureUploader';
import type { GlContext } from './GlContext';
import type { GlCustomMaterialShaderSource } from './GlCustomMaterialShaderSource';
import type { GlMaterialRenderer } from './GlMaterialRenderer';
import type { GlMeshMaterialRenderer } from './GlMeshMaterialRenderer';
import type { GlModifierSnippet } from './GlModifierSnippet';
import type { GlPbrExtensionRegistration } from './GlPbrExtensionRegistration';
import type { GlRenderEffectRegistration } from './GlRenderEffectPipeline';
import type { GlRenderTarget } from './GlRenderTarget';
import type { GlRenderTextureEntry, GlRenderTextureGuard } from './GlRenderTexture';
import type { GlBitmapShader, GlShaderLocations } from './GlShaderLocations';
import type { GlShapeMesh } from './GlShapeMesh';
import type { GlTextureResolver } from './GlTextureResolver';
import type { GlVelocityWriter } from './GlVelocityWriter';
import type { Image } from './Image';
import type { Material } from './Material';
import type { KeyedTable, SlotTable } from './RegistryTable';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderRegistries, RenderState, RenderStateRuntime } from './RenderState';
import type { RenderTexture } from './RenderTexture';
import type { SamplerLike } from './Sampler';
import type { ShapeRasterizer } from './ShapeRasterizer';
import type { TextureSource } from './TextureSource';
import type { TintMaterialData } from './TintMaterialData';

export interface GlRenderState extends RenderState {
  applyBlendMode: ((state: GlRenderState, blendMode: BlendMode | null) => void) | null;
  readonly gl: GlContext;
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
  registries: GlRenderRegistries;
  // Opt-in dev guard: called where a draw path is about to TRUST a cached binding slot and skip the
  // rebind. Null in production, so the check costs nothing and the message lives in the guard module.
  bindingCacheGuard: ((state: GlRenderState, expectedProgram: WebGLProgram) => void) | null;
  // Active GPU bindings tracked to avoid redundant state changes. Internal — formerly public on the
  // GlRenderState entity.
  currentBlendMode: BlendMode | null;
  currentProgram: WebGLProgram | null;
  currentTexture: WebGLTexture | null;
  // Whether the currently bound display texture stores straight RGB in compressed blocks. Built-in
  // 2D shaders premultiply its sample before ONE/ONE_MINUS_SRC_ALPHA blending.
  currentTextureStraightAlpha: boolean;
  // Optional owner-installed seam that drains queued draws before render-gl hands the context to a
  // foreign renderer. scene2d-gl installs its quad-batch writer flush lazily when a batch is first prepared;
  // render-gl reaches it only through this contract slot and therefore does not depend on scene2d-gl.
  flushPendingDraws?: ((state: GlRenderState) => void) | null;

  defaultBitmapShader: GlBitmapShader | null;
  particleShader?: GlParticleShader;
  particleCornerBuffer?: WebGLBuffer;
  particleInstanceBuffer?: WebGLBuffer;
  particleInstanceData?: Float32Array;
  quadBatchShader?: GlQuadBatchShader;
  quadBatchCornerBuffer?: WebGLBuffer;
  // Compiled color-adjustment programs, owned by the opt-in fold (registerGlColorAdjustmentMaterialFeature). Absent
  // until the first folded flush; a state that never enables color adjustment carries neither.
  colorScaleBiasInstancedShader?: GlColorScaleBiasInstancedShader;
  colorMatrixInstancedShader?: GlColorScaleBiasInstancedShader;
  colorTintInstancedShader?: GlColorScaleBiasInstancedShader;
  uniformColorScaleBiasShader?: GlUniformColorScaleBiasShader;
  shapeMeshColorScaleBiasShader?: GlShapeMeshColorScaleBiasShader;
  shapeMeshColorMatrixShader?: GlShapeMeshColorScaleBiasShader;
  // The 3D material dispatch policy lives in registries.meshMaterialRenderers, separate from the 2D
  // material table because a material kind is either 2D or 3D, never both. This cache is the context-tier
  // realization of lazily uploaded MeshGeometry data, keyed by the geometry entity (parallel to
  // MeshGeometryRuntime.webglData; scene-gl owns and casts the concrete value shape).
  sceneMeshUploadCache?: WeakMap<object, object> | null;
  // Per-material-kind bitmap shader for the immediate (display-object) path. resolveGlShader
  // looks a node's shader up here by its material kind — the render path has no color-adjustment (or
  // any material-specific) knowledge; the material's shader and its registration own that.
  materialBitmapShaderMap?: Map<Kind, GlBitmapShader>;
  // Optional per-node shader-binding resolver. Installed by setGlShader; absent (and tree-shaken
  // with the binding map) until a custom shader is bound to a node.
  webglShaderBindingResolver?: (renderProxy: RenderProxy2D) => GlBitmapShader | undefined;
  quadBatchWriterBlendMode: BlendMode | null;
  // The active quad-batch writer material (flush key, compared by reference) and its resolved
  // renderer + per-instance float stride. quadBatchWriterMaterialData/Buffer hold the active
  // material's per-instance attributes, parallel to the base quadBatchWriterInstanceData.
  quadBatchWriterMaterial: Material | null;
  quadBatchWriterMaterialRenderer: GlMaterialRenderer | null;
  quadBatchWriterMaterialFloats: number;
  quadBatchWriterMaterialData: Float32Array;
  quadBatchWriterMaterialBuffer: WebGLBuffer | null;
  quadBatchWriterCount: number;
  quadBatchWriterInstanceBuffer: WebGLBuffer | null;
  quadBatchWriterInstanceData: Float32Array;
  // Resolved backend handle plus the sampling/alpha metadata needed to restore its binding when the
  // deferred batch flushes. High-level Texture resolution stays in texture-using callers.
  quadBatchWriterTexture: WebGLTexture | null;
  quadBatchWriterSampler: SamplerLike | null;
  quadBatchWriterStraightAlpha: boolean;
  // Transitional sampling key for legacy atlas/image writers. A Texture carries its sampler directly.
  quadBatchWriterSmoothing: boolean | null;
  // Color-transform fold state for the active quad-batch writer. Orthogonal to the material and never a
  // flush key, so tinted and untinted nodes with the same texture+blend share one batch. Mode 0 =
  // no tint (lean base shader), 1 = one uniform tint for the whole batch (u_colorScale/u_colorBias), 2 =
  // per-instance tints (a_colorScale/a_colorBias). A batch starts at 0, rises to 1 on the first tint, and
  // promotes to 2 — back-filling already-written instances with the prior value/identity — when
  // tints diverge, so attaching a tint only ever promotes a batch, never splits it.
  // quadBatchWriterColorScaleBiasData/Buffer hold the per-instance floats (8 per instance) for mode 2;
  // quadBatchWriterUniformColorScaleBias holds the shared value for mode 1.
  quadBatchWriterColorScaleBiasMode?: number;
  quadBatchWriterUniformColorScaleBias?: ColorScaleBias | TintMaterialData | readonly number[] | null;
  quadBatchWriterColorScaleBiasData?: Float32Array;
  quadBatchWriterColorMatrixData?: Float32Array;
  quadBatchWriterColorTintData?: Uint32Array;
  quadBatchWriterColorScaleBiasBuffer: WebGLBuffer | null;
  // Per-clip unwind stack: the form of each pushed clip (scissor vs stencil contour) so popClip
  // un-installs the right gate.
  clipForms: ('rect' | 'contour')[];
  // Active stencil nesting depth, now driven by contour clips (formerly by masks). The GPU draw path
  // reads this to know when a stencil test is live. Rect clips use the scissor and do not touch it.
  currentMaskDepth?: number;
  currentScissorRect?: GlScissorRect | null;
  /**
   * The framebuffer currently bound for rendering. Null means the default
   * (screen) framebuffer. Maintained internally so begin/end render target
   * can restore the previous binding without a gl.getParameter() call.
   */
  currentFramebuffer: WebGLFramebuffer | null;
  /**
   * The GlRenderTarget currently bound via beginGlRenderPass, or null when rendering to the canvas.
   * A producer stamps the color space of the content it draws onto this target (drawGlScene3D declares
   * 'linear'); the present step then reads target.colorSpace to encode correctly. Restored by
   * endGlRenderPass alongside currentFramebuffer.
   */
  currentRenderTarget?: GlRenderTarget | null;
  /**
   * Active GL-space viewport within the current render target. Its origin is bottom-left, matching
   * WebGL viewport/scissor coordinates; projection paths use its dimensions while clip paths also add
   * its origin. Null means the full canvas.
   */
  renderTargetViewport: GlViewportRect | null;
  shaderLoc: GlShaderLocations | null;
  // Raw-element texture cache: a canvas/video/image element uploaded directly (video frames, canvas-backed
  // shapes and text). Keyed by the element; the caller owns re-upload timing (video re-uploads every frame).
  textureCache: WeakMap<CanvasImageSource, WebGLTexture>;
  // Premultiplied texture realizations for TextureSource siblings. Keyed by stable entity identity and
  // guarded by content version so mutable Bitmaps re-upload in place.
  textureSourcePremultipliedTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  textureSourcePremultipliedSrgbTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  // Straight (upload-as-is) sibling used by the straight-blend 3D path and native compressed images.
  textureSourceStraightTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  textureSourceStraightSrgbTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  // Borrowed native handles registered by createExternalGlTexture. Disposing forgets these entries;
  // the caller retains allocation ownership.
  glExternalTextureCache?: WeakMap<ExternalTexture, WebGLTexture>;
  glRenderTextureCache?: WeakMap<RenderTexture, GlRenderTextureEntry>;
  glRenderTextureGuard?: GlRenderTextureGuard | null;
  // Dynamic host-video caches keyed by source identity and split by GPU color interpretation.
  // `uploadedVersion` tracks the last decoded frame copied to GL.
  videoTextureCache?: WeakMap<Image, { texture: WebGLTexture; uploadedVersion: number }>;
  videoSrgbTextureCache?: WeakMap<Image, { texture: WebGLTexture; uploadedVersion: number }>;
  // Textures whose mip chain has been generated via gl.generateMipmap, so a mip-sampling bind
  // generates the chain exactly once and updateGlTexture can refresh it after a re-upload. Keyed by
  // the GL texture (parallel to textureCache), lazily created on the first mip-sampled bind.
  mipmappedTextures?: WeakSet<WebGLTexture>;
  // The resolved EXT_texture_filter_anisotropic extension and the hardware anisotropy cap, both
  // resolved once on the first anisotropic bind. anisotropyExt is undefined until queried, then the
  // extension object or null when the GPU does not support anisotropic filtering.
  anisotropyExt?: EXT_texture_filter_anisotropic | null;
  maxAnisotropy?: number;
  quadVertexBuffer: WebGLBuffer;
  quadIndexBuffer: WebGLBuffer;
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
