import type { BlendMode } from './BlendMode';
import type { ColorScaleBias } from './ColorScaleBias';
import type { Entity } from './Entity';
import type { ExternalTexture } from './ExternalTexture';
import type { ImageResource } from './ImageResource';
import type { Material } from './Material';
import type { Matrix } from './Matrix';
import type { KeyedTable, SlotTable } from './RegistryTable';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderRegistries, RenderState, RenderStateRuntime } from './RenderState';
import type { RenderTexture } from './RenderTexture';
import type { SamplerLike } from './Sampler';
import type { ShapeRasterizer } from './ShapeRasterizer';
import type { TextureSource } from './TextureSource';
import type { TintMaterialData } from './TintMaterialData';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder';
import type { WgpuCompressedTextureUploader } from './WgpuCompressedTextureUploader';
import type { WgpuCustomMaterialShaderSource } from './WgpuCustomMaterialShaderSource';
import type { WgpuDeviceRuntime } from './WgpuDeviceRuntime';
import type { WgpuDeviceState } from './WgpuDeviceState';
import type { WgpuPresentationSurface } from './WgpuHost';
import type { WgpuMaterialRenderer } from './WgpuMaterialRenderer';
import type { WgpuMeshMaterialRenderer } from './WgpuMeshMaterialRenderer';
import type { WgpuModifierSnippet } from './WgpuModifierSnippet';
import type { WgpuParticleResources } from './WgpuParticleResources';
import type { WgpuPipeline } from './WgpuPipeline';
import type { WgpuQuadBatchResources } from './WgpuQuadBatchResources';
import type { WgpuRenderEffectRegistration } from './WgpuRenderEffectPipeline';
import type { WgpuRenderTarget } from './WgpuRenderTarget';
import type { WgpuRenderTextureEntry, WgpuRenderTextureGuard } from './WgpuRenderTexture';
import type { WgpuShapeMesh } from './WgpuShapeMesh';
import type { WgpuTextureResolver } from './WgpuTextureResolver';
import type { WgpuVelocityWriter } from './WgpuVelocityWriter';

export interface WgpuRenderState extends RenderState {
  applyBlendMode: ((state: WgpuRenderState, blendMode: BlendMode | null) => void) | null;
  readonly deviceState: WgpuDeviceState;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly pipeline: Readonly<WgpuPipeline>;
}

// Presentation is an explicit capability. Device-only offscreen states deliberately cannot be passed
// to frame/surface APIs, while every draw and render-target API continues to accept the base state.
export interface WgpuPresentationRenderState extends WgpuRenderState {
  readonly context: GPUCanvasContext;
  // The presentation surface's live size. Not an HTMLCanvasElement: nothing on this path reads a DOM
  // member, so a native host supplies its own size provider and the web path passes its canvas directly.
  readonly surface: WgpuPresentationSurface;
}

/**
 * The outcome of deriving a second render pipeline over an existing one.
 *
 * Method-tight: `reason` names what happened, and the payload for each arm is exactly what that arm
 * can supply. A dead GPUDevice cannot back a new pipeline, and that is an expected outcome rather
 * than a programmer error — so it is reported, not thrown. `info` is the device's own loss report,
 * carried through unchanged; nothing here claims a device can be rebuilt or recovered.
 */
export type WgpuOffscreenRenderStateResult = Entity &
  (
    | { readonly reason: 'device-lost'; readonly info: GPUDeviceLostInfo }
    | { readonly reason: 'ok'; readonly state: WgpuRenderState }
  );

// Pure registration policy owned by one WebGPU render pipeline. Tables are persistent: a derived
// pipeline may initially share them, while either aggregate can later replace a member independently.
export interface WgpuRenderRegistries extends RenderRegistries, Entity {
  colorAdjustmentFeature?: SlotTable<WgpuColorAdjustmentMaterialFeature>;
  // Optional diagnostic policy stays separate from the rendering feature: binding this callback
  // reports an unwired feature but never enables color-adjustment rendering behavior.
  colorAdjustmentFeatureGuard?: SlotTable<WgpuColorAdjustmentMaterialFeatureGuard>;
  // Optional compressed-container policy. Both slots are empty until explicitly registered so
  // ordinary bitmap bundles retain neither the format table nor a fallback decoder.
  compressedTextureDecoder: SlotTable<WgpuCompressedTextureDecoder>;
  compressedTextureUpload: SlotTable<WgpuCompressedTextureUploader>;
  customMaterialShaders: KeyedTable<WgpuCustomMaterialShaderSource>;
  materialRenderers: KeyedTable<WgpuMaterialRenderer>;
  meshMaterialRenderers: KeyedTable<WgpuMeshMaterialRenderer>;
  modifierSnippets: KeyedTable<WgpuModifierSnippet>;
  // Shader cache identity advances with every snippet-table replacement, including same-kind
  // replacements whose define signature is unchanged but whose emitted source differs.
  modifierSnippetRevision: number;
  renderEffects: KeyedTable<WgpuRenderEffectRegistration>;
  shapeRasterizer: SlotTable<ShapeRasterizer>;
  textureResolvers: KeyedTable<WgpuTextureResolver>;
  velocityWriters: KeyedTable<WgpuVelocityWriter>;
}

// The opt-in inline color-adjustment fold for the WebGPU sprite/quad batch. Registered as persistent
// per-state policy by registerWgpuColorAdjustmentMaterialFeature; absent on a state that never opted in,
// so the base batch — which only ever reaches this through the optional registry slot — carries none of the fold's WGSL and
// tree-shakes it out. `record` folds one instance's color adjustment into the active batch's
// promote-not-split state machine; `resolveFlush` returns the group-3 storage data + folded shader
// module for a tinted batch (or null when the batch has no adjustment, so the caller runs the lean
// material path). This is the generic capability seam — color adjustment is its first consumer.
export interface WgpuColorAdjustmentMaterialFeature {
  // The one backend-authored pointwise color-remap implementation, spliced only into promoted
  // material-family variants. It lives on the registered feature to preserve bundle shake-out.
  readonly fragmentShaderChunk: string;
  readonly matrixFragmentShaderChunk: string;
  // Optional because the feature contract is also used by 3D material-family compilers, which need
  // only the shader chunks. The scene2d implementation installs this hook so tessellated solid fills
  // reach the same opt-in fold without the lean mesh path importing its shader implementation.
  drawShapeMeshes?(
    state: WgpuRenderState,
    renderProxy: RenderProxy2D,
    meshes: readonly WgpuShapeMesh[],
    buffers: WgpuShapeMeshBuffers,
  ): void;
  record(
    runtime: WgpuRenderStateRuntime,
    colorScaleBias: ColorScaleBias | TintMaterialData | readonly number[] | null | undefined,
    instanceIndex: number,
  ): void;
  resolveFlush(state: WgpuRenderState, count: number): WgpuColorAdjustmentFlush | null;
}

export type WgpuColorAdjustmentMaterialFeatureGuard = (
  state: WgpuRenderState,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData | readonly number[]>,
) => void;

// The per-flush realization of a tinted batch: the per-instance storage data (`data`, `floats` floats
// each) and the folded shader `module` the batch binds at @group(3), returned by
// WgpuColorAdjustmentMaterialFeature.resolveFlush.
export interface WgpuColorAdjustmentFlush {
  data: Float32Array | Uint32Array;
  floats: number;
  module: GPUShaderModule;
}

// Package-private GPU state for a WgpuRenderState entity. Lives in the runtime tier (not on the
// entity) so the public WgpuRenderState surface stays minimal; the render path resolves it each
// frame via getWgpuRenderStateRuntime. Defined in @flighthq/types — the header layer — so
// out-of-package custom renderers can reach the same state.
export interface WgpuBindGroupLayouts extends Entity {
  readonly textureBindGroupLayout: GPUBindGroupLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
}

export interface WgpuRenderStateRuntime extends RenderStateRuntime {
  context: WgpuDeviceRuntime;
  registries: WgpuRenderRegistries;
  // Derived pipelines resolve optional blend-mode wiring through this parent at the draw seam. The
  // entity's applyBlendMode member stays a plain field, so the delegation is explicit and portable.
  applyBlendModeParent: WgpuRenderState | null;
  // Active blend mode tracked to avoid redundant pipeline rebinds. Internal — formerly public on the
  // WgpuRenderState entity.
  currentBlendMode: BlendMode | null;
  teardowns: ((state: WgpuRenderState) => void)[];
  // Present only for the bounded duration of withWgpuFrameBorrow. Device-only render-target code uses
  // this extent when it restores the borrowed presentation pass without gaining a surface capability.
  borrowedSurfaceExtent: { readonly height: number; readonly width: number } | null;

  // Bind group layouts — shared across all pipelines
  uniformBindGroupLayout: GPUBindGroupLayout;
  textureBindGroupLayout: GPUBindGroupLayout;

  // Uniform ring buffer: each slot is uniformStride bytes (minUniformBufferOffsetAlignment)
  uniformBuffer: GPUBuffer;
  uniformData: Float32Array;
  uniformDataU32: Uint32Array;
  uniformOffset: number;
  uniformStride: number;
  uniformBindGroup: GPUBindGroup;

  // Scratch array for matrix building (9 floats, column-major)
  matrixArray: Float32Array;

  // Pipeline cache keyed by blend mode + stencil mode + color adjustment flag
  pipelineCache: Map<string, GPURenderPipeline>;

  // Samplers. linear/nearest are the clamp-to-edge defaults for the 2D bitmap path; material textures
  // that tile or mip go through samplerCache, keyed by a NUMBER that bit-packs min/mag/wrapU/wrapV/
  // mipmap/anisotropy (getWgpuSampler) — a number, not a template string, so the per-bind lookup that runs every
  // frame allocates nothing. A GPUSampler's address mode, mip filter, and anisotropy are immutable and
  // must be chosen at bind-group creation.
  linearSampler: GPUSampler;
  nearestSampler: GPUSampler;
  samplerCache: Map<number, GPUSampler>;

  // Guard callback invoked when a texture requests mipmaps but no generator is registered. The
  // upload path degrades to a single-level texture; this slot reports the degradation. Null until
  // a guard module installs a handler.
  mipmapDegradedGuard: ((state: WgpuRenderState) => void) | null;
  // Registered mip-chain generator. Null until registerWgpuMipmapGeneration installs one; the
  // upload paths read this slot rather than statically importing the generator module, so a bundle
  // that never registers mip generation tree-shakes the pipeline, shader, and cache entirely.
  mipmapGenerator:
    | ((state: WgpuRenderState, texture: GPUTexture, width: number, height: number, format: GPUTextureFormat) => void)
    | null;
  // Lazily-built downsample render pipelines and bind-group layouts for GPU mip-chain generation.
  // WebGPU has no generateMipmap, so a mipmapped material texture's lower levels are rendered by
  // repeatedly downsampling the level above. The format-keyed cache keeps linear and sRGB target
  // pipelines distinct. Empty until the first such upload.
  mipmapPipelineCache: Map<GPUTextureFormat, { bindGroupLayout: GPUBindGroupLayout; pipeline: GPURenderPipeline }>;

  // Raw-element texture cache: a canvas/video/image element uploaded directly, keyed by the element.
  textureCache: WeakMap<CanvasImageSource, WgpuTextureEntry>;
  // Premultiplied texture realizations for TextureSource siblings. Keyed by stable entity identity and
  // guarded by content version so mutable Bitmaps re-upload in place.
  textureSourcePremultipliedTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  textureSourcePremultipliedSrgbTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  // Straight (upload-as-is) sibling used by the straight-blend 3D path and native compressed images.
  textureSourceStraightTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  textureSourceStraightSrgbTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  // Dynamic host-video caches split by GPU color interpretation. The GPU texture persists across
  // frames; uploadedVersion gates the copy, while width/height detect resolution changes.
  videoTextureCache?: WeakMap<ImageResource, WgpuVideoTextureEntry>;
  videoSrgbTextureCache?: WeakMap<ImageResource, WgpuVideoTextureEntry>;
  // Borrowed native handles and derived non-owning views/bind groups. Disposal only forgets the entry.
  wgpuExternalTextureCache?: WeakMap<ExternalTexture, WgpuTextureEntry>;
  // Render Texture realizations are keyed by Texture because their GPU allocation is state-bound.
  wgpuRenderTextureCache?: WeakMap<RenderTexture, WgpuRenderTextureEntry>;
  wgpuRenderTextureGuard?: WgpuRenderTextureGuard | null;
  // Custom shader (default bitmap shader; can be replaced via registerWgpuBitmapShader)
  defaultBitmapShader: WgpuBitmapShader | null;

  // Optional per-node shader-binding resolver. Installed by setWgpuShader; absent (and tree-shaken
  // with the binding map) until a custom shader is bound to a node.
  webgpuShaderBindingResolver?: (renderProxy: RenderProxy2D) => WgpuBitmapShader | undefined;

  // Particle instance buffer (grown on demand)
  particleInstanceBuffer: GPUBuffer | null;
  particleInstanceData: Float32Array | null;
  particleInstanceCapacity: number;

  // Universal quad-batch writer (cross-node batching for Sprite/QuadBatch/Tilemap). The flush key is the
  // material (by reference); the resolved renderer appends its per-instance floats into the material
  // storage buffer.
  quadBatchWriterBlendMode: BlendMode | null;
  quadBatchWriterMaterial: Material | null;
  quadBatchWriterMaterialRenderer: WgpuMaterialRenderer | null;
  quadBatchWriterMaterialFloats: number;
  quadBatchWriterCount: number;
  quadBatchWriterInstanceData: Float32Array;
  // Parallel per-instance material data (instanceFloatCount floats per instance), written by the
  // active material's packInstance. Separate from the base instance data so the base layout carries
  // no material concern.
  quadBatchWriterMaterialData: Float32Array;
  // Resolved backend entry plus its sampling descriptor. High-level Texture resolution stays in
  // texture-using callers rather than leaking registry code into this shared writer.
  quadBatchWriterTexture: WgpuTextureEntry | null;
  quadBatchWriterSampler: SamplerLike | null;
  // Transitional sampling key for legacy atlas/image writers. A Texture carries its sampler directly.
  quadBatchWriterSmoothing: boolean | null;
  // Color-adjustment fold state for the active quad-batch writer, owned by the opt-in
  // registerWgpuColorAdjustmentMaterialFeature (absent until then, so a state that never tints allocates none of it).
  // Orthogonal to the material and never a flush key, so tinted and untinted nodes with the same
  // texture+blend share one batch. Mode 0 = no tint (base module), 2 = per-instance tints. A batch
  // promotes to 2 when any member is tinted, back-filling untinted members with identity — attaching a
  // tint only promotes a batch, never splits it. Wgpu realizes every tint through the per-instance
  // storage buffer (quadBatchWriterColorScaleBiasData, 8 floats per instance): a whole-batch tint is the
  // same value on each instance; it has no separate hardware-uniform path (the GL u_colorScale path does).
  // quadBatchWriterUniformColorScaleBias holds the shared value while a batch stays whole-batch uniform,
  // deferring the per-instance fill until (and if) tints diverge.
  quadBatchWriterColorScaleBiasMode?: number;
  quadBatchWriterUniformColorScaleBias?: ColorScaleBias | TintMaterialData | readonly number[] | null;
  quadBatchWriterColorScaleBiasData?: Float32Array;
  quadBatchWriterColorMatrixData?: Float32Array;
  quadBatchWriterColorTintData?: Uint32Array;
  // Per-frame pool of GPU storage buffers, one slot claimed per flush. The batch records draws into
  // the canvas pass, but the pass is submitted once at end of frame, so every flush's draw reads its
  // buffers at submit time. Reusing a single buffer across flushes would leave them all reading the
  // last flush's data — the whole batch collapsing onto one position. Each flush claims a distinct
  // slot instead; the cursor resets per frame and slots are reused across frames, which is safe
  // because a frame's writeBuffer is queued after the previous frame's submit completes.
  quadBatchWriterBufferPool: WgpuQuadBatchWriterBufferSlot[];
  quadBatchWriterBufferCursor: number;
  // The 3D instanced-mesh equivalent, and it exists for the same reason: every InstancedMesh in a scene
  // sets its instance-step vertex buffer and draws into the SAME render pass, which is submitted once at
  // end of frame. A single shared buffer rewritten between those draws leaves every instanced mesh
  // reading the last one's matrices — each batch collapsing onto another batch's placement. Each
  // instanced draw claims a distinct slot; the cursor resets per frame alongside the quad-batch one.
  meshInstanceBufferPool: WgpuMeshInstanceBufferSlot[];
  meshInstanceBufferCursor: number;
  // The 3D material dispatch policy lives in registries.meshMaterialRenderers, separate from the 2D
  // material table because a material kind is either 2D or 3D, never both. This cache is the device-tier
  // realization of lazily uploaded MeshGeometry data, keyed by the geometry entity (parallel to
  // MeshGeometryRuntime.webgpuData; scene-wgpu owns and casts the concrete value shape).
  sceneMeshUploadCache?: WeakMap<object, object> | null;

  standardMaterialModule?: GPUShaderModule;
  colorScaleBiasModule?: GPUShaderModule;
  packedTintModule?: GPUShaderModule;
  colorMatrixModule?: GPUShaderModule;
  shapeMeshColorScaleBiasPipelines?: Map<string, WgpuShapeMeshPipeline>;

  particleResources?: WgpuParticleResources;
  quadBatchResources?: WgpuQuadBatchResources;

  // Frame state: command encoder and current render pass
  commandEncoder: GPUCommandEncoder | null;
  renderPass: GPURenderPassEncoder | null;

  // Canvas surface — cached per frame to avoid calling getCurrentTexture twice
  canvasTextureView: GPUTextureView | null;
  canvasViewCleared: boolean;

  // Optional 2× supersampled main surface. The scene renders into surfaceAntialiasTexture; immediately
  // before submit, one fullscreen linear-sampling pass resolves it into surfacePresentationView (the
  // swapchain view, or frameCaptureTexture when readback is enabled). All scene pipelines remain
  // single-sampled and unchanged: this is deliberately a surface seam rather than a pipeline variant.
  surfaceAntialiasEnabled: boolean;
  surfaceAntialiasTexture: GPUTexture | null;
  surfaceAntialiasView: GPUTextureView | null;
  surfaceAntialiasWidth: number;
  surfaceAntialiasHeight: number;
  surfaceAntialiasResolveBindGroupLayout: GPUBindGroupLayout | null;
  surfaceAntialiasResolvePipeline: GPURenderPipeline | null;
  surfaceAntialiasResolveBindGroup: GPUBindGroup | null;
  surfacePresentationView: GPUTextureView | null;

  // Opt-in frame capture (enableWgpuFrameCapture → createBitmapFromWgpuRenderState). When enabled,
  // the frame is rendered into frameCaptureTexture (an offscreen COPY_SRC target) instead of the
  // swapchain — software/headless adapters do not present the swapchain and its texture reads back as
  // zeros. submitWgpuRenderPass copies that texture into frameCaptureBuffer *within the render frame*
  // (GPU work queued in a later task is dropped on these adapters); createBitmapFromWgpuRenderState
  // only maps the buffer on the CPU afterward.
  frameCaptureEnabled: boolean;
  frameCaptureTexture: GPUTexture | null;
  frameCaptureBuffer: GPUBuffer | null;
  frameCaptureBytesPerRow: number;
  frameCaptureWidth: number;
  frameCaptureHeight: number;

  // Depth-stencil for the main canvas (re-created when canvas size changes)
  depthStencilTexture: GPUTexture | null;
  depthStencilView: GPUTextureView | null;
  depthStencilWidth: number;
  depthStencilHeight: number;

  // Clip state. Masks were retired into clips (a mask is a path ClipRegion). `clipForms` is the
  // per-clip unwind stack (scissor vs stencil contour).
  clipForms: ('rect' | 'contour')[];
  // Active stencil nesting depth, driven by contour clips (formerly by masks). The GPU draw path reads
  // this to know when a stencil test is live and as the 'masked'-mode stencil reference.
  currentMaskDepth: number;
  maskWriteMode: boolean;
  // Lazily-built contour-clip stencil pipelines (increment/decrement) and the per-active-clip undo stack
  // (the geometry + uniform a pop redraws to decrement its stencil region). See webgpuClipContours.ts.
  // Keyed per color-attachment format: the stencil pipelines declare a (write-masked) color target whose
  // format must match the pass attachment, so a clip inside an HDR (rgba16float) effect target needs its
  // own variant.
  clipContourPipelines?: Map<GPUTextureFormat, WgpuClipContourPipelines>;
  clipContourStack: WgpuClipContourEntry[];
  // GPU buffers replaced/retired mid-frame (a clip pop's per-clip buffers, a grown particle instance
  // buffer) but still referenced by recorded draws in the open command encoder; destroyed only after
  // submitWgpuRenderPass submits, since the frame's submit is deferred and destroying them earlier
  // invalidates the command buffer.
  retiredBuffers?: GPUBuffer[];
  // The same deferral for TEXTURES replaced mid-frame (a grown skin-palette arena). A texture the open
  // encoder's bind groups still reference cannot be destroyed before submit either — doing so fails the
  // submit outright and the whole frame renders nothing, which is how this was found.
  retiredTextures?: GPUTexture[];

  // Lazily-built flat-color pipeline for the GPU tessellated solid-fill shape path (webgpuShapeMesh.ts).
  // Null until the first solid-fill shape draws; shared across every shape on this device.
  // Flat-color tessellated-shape fill pipelines, one per color-attachment format (the canvas format and
  // any HDR effect-target format), since a Wgpu pipeline bakes its target format. Lazily populated.
  // Keyed by color format + fixed-function node blend mode (both are immutable pipeline state).
  shapeMeshPipelines?: Map<string, WgpuShapeMeshPipeline>;

  // Clip rectangle scissor stack
  scissorStack: WgpuScissorRect[];
  currentScissorRect: WgpuScissorRect | null;

  // Render target viewport override (null = use canvas dimensions)
  renderTargetViewport: { width: number; height: number } | null;

  // Color format of the render target currently being drawn into (the canvas format outside a pushed
  // target, the target's format inside one). A Wgpu render pipeline bakes its color attachment format,
  // so scene pipelines key their compiled variant on this to draw into HDR (rgba16float) effect targets.
  currentColorFormat?: GPUTextureFormat;
  // The target currently bound through beginWgpuRenderPass. Producers stamp its content color space;
  // null means the canvas, where no adapting target present follows the draw.
  currentRenderTarget: WgpuRenderTarget | null;

  // Saved render pass state for render target push/pop
  renderTargetStack: WgpuSavedPassState[];
}

// A bound Wgpu bitmap shader: a render pipeline plus a bind hook that writes its per-draw uniforms.
// The default shader is registered on the render state runtime; custom shaders are installed via
// registerWgpuBitmapShader / setWgpuShader.
export interface WgpuBitmapShader {
  readonly pipeline: GPURenderPipeline;
  bind(
    state: WgpuRenderState,
    renderProxy: {
      alpha: number;
    },
  ): void;
}

// One active contour clip's GPU resources. Kept on a stack so popWgpuClipContours can redraw the
// same geometry/uniform to decrement its stencil region, then destroy the buffers.
export interface WgpuClipContourEntry {
  vertexBuffer: GPUBuffer;
  vertexCount: number;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  depth: number;
}

// Cached stencil pipelines for contour clips: `write` increments covered pixels (open a clip),
// `erase` decrements them (pop). Both are color-less, position-only, and share one uniform
// bind-group layout.
export interface WgpuClipContourPipelines {
  write: GPURenderPipeline;
  erase: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

// The render-pass state saved when pushing a render target, restored on pop. Lives on the
// WgpuRenderState runtime's renderTargetStack.
export interface WgpuSavedPassState {
  canvasTextureView: GPUTextureView | null;
  canvasViewCleared: boolean;
  depthStencilView: GPUTextureView | null;
  renderTargetViewport: { width: number; height: number } | null;
  renderTransform2D: Matrix | null;
  colorFormat: GPUTextureFormat | undefined;
  renderTarget: WgpuRenderTarget | null;
}

// A pixel-space scissor rectangle pushed onto the WgpuRenderState runtime's scissor stack for
// rectangular clip regions.
export interface WgpuScissorRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

// Per-shape reusable GPU buffer slots for the tessellated solid-fill path, cached on rendererData.
// Each mesh region owns one slot because queue writes occur before the recorded render pass submits;
// sharing a slot would make every draw observe the final region's geometry and color. Slots grow by
// replacement and are destroyed with rendererData.
export interface WgpuShapeMeshBuffers {
  vertexBuffers: GPUBuffer[];
  vertexCapacities: number[];
  indexBuffers: GPUBuffer[];
  indexCapacities: number[];
  uniformBuffers: GPUBuffer[];
  bindGroups: GPUBindGroup[];
  // Separate opt-in slots for the larger scale/bias uniform. Untinted shapes allocate only the lean
  // 64-byte uniforms above; registered color adjustment allocates these 96-byte siblings on demand.
  colorScaleBiasUniformBuffers: GPUBuffer[];
  colorScaleBiasBindGroups: GPUBindGroup[];
}

// Cached flat-color pipeline for the GPU tessellated solid-fill shape path. Position-only vertex
// (@location(0) vec2f), a uniform bind group carrying mat3x3f matrix + vec4f color. Stencil compares
// 'equal' (gated by any active contour clip) and writes nothing, so the fill never disturbs the
// stencil.
export interface WgpuShapeMeshPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

// One pool slot's GPU buffers, sized lazily and grown by allocating a replacement (the superseded
// buffer is released to GC, never destroyed mid-life, since a prior frame's submit may still
// reference it). materialBuffer stays null until a flush with per-instance material data uses it.
export interface WgpuQuadBatchWriterBufferSlot {
  instanceBuffer: GPUBuffer | null;
  instanceCapacity: number;
  materialBuffer: GPUBuffer | null;
  materialCapacity: number;
}

// One 3D instanced-draw pool slot: the instance-step vertex buffer holding a single InstancedMesh's
// per-instance model matrices for one draw. Grown by allocating a replacement rather than destroying the
// superseded buffer, which a prior frame's submit may still reference.
export interface WgpuMeshInstanceBufferSlot {
  buffer: GPUBuffer | null;
  capacity: number;
}

// What was ALLOCATED on the GPU, as distinct from how it will be sampled. Every field here is an
// allocation axis fixed at `createTexture` time, so two requests differing in any of them are different
// resources and must not share one realization. `mipLevelCount` is the axis that makes this a type
// rather than a comment: WebGPU fixes it at creation, so a level-0-only texture can never serve a
// minified draw no matter which sampler is bound to it — the allocation, not the binding, is wrong.
// A resource is therefore only reusable for a request whose complete upload key matches it.
export interface WgpuTextureResource {
  mipLevelCount: number;
  // True when sampled RGB is straight-alpha and the 2D display shader must premultiply it before
  // applying color adjustments/blending. Native compressed blocks cannot be premultiplied in place.
  straightAlpha?: boolean;
  texture: GPUTexture;
  view: GPUTextureView;
}

// The group(1) bind groups over one resource's `view`, one per sampler, keyed by sampler identity.
//
// Which sampler a draw uses is a DRAW POLICY — the state's `allowSmoothing`, or a per-bitmap
// `smoothing` override — and is never part of the resource's identity. Keeping the pair here rather
// than as a field on the resource is the whole point: a bind group captured INTO a shared cached
// resource makes the first caller's policy decide how every later sharer samples it.
//
// Layout is deliberately NOT a key axis. Every 2D-path bind group over these views is built against
// the single `textureBindGroupLayout` on the runtime, so a layout dimension would never vary and
// would be machinery with no second value to hold.
export type WgpuTextureBindings = Map<GPUSampler, GPUBindGroup>;

// An uploaded GPU texture, cached per image source in the WgpuRenderState runtime's textureCache: an
// allocated resource plus the per-sampler bind groups derived from it.
export interface WgpuTextureEntry extends WgpuTextureResource, Entity {
  bindings: WgpuTextureBindings;
  // A sampler fixed by the SOURCE rather than by the draw — external and video textures carry their
  // own filtering, which the global `allowSmoothing` policy must not override. Absent means "follow the
  // policy". An explicit per-bitmap smoothing override still wins over both, as it always did.
  sampler?: GPUSampler;
}

// A WgpuTextureEntry cached per TextureSource, carrying the uploaded content `version`.
export interface WgpuTextureSourceTextureEntry extends WgpuTextureEntry {
  version: number;
}

export interface WgpuVideoTextureEntry extends WgpuTextureEntry {
  height: number;
  sampler: GPUSampler;
  uploadedVersion: number;
  width: number;
}
