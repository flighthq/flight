import type { BlendMode } from './BlendMode';
import type { ColorScaleBias } from './ColorScaleBias';
import type { Kind } from './Entity';
import type { ImageResource } from './ImageResource';
import type { Material } from './Material';
import type { Matrix } from './Matrix';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState, RenderStateRuntime } from './RenderState';
import type { RenderTexture } from './RenderTexture';
import type { SamplerLike } from './Sampler';
import type { Texture } from './Texture';
import type { TextureSource } from './TextureSource';
import type { TextureSourceKind } from './TextureSourceKind';
import type { TintMaterialData } from './TintMaterialData';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder';
import type { WgpuCompressedTextureUploader } from './WgpuCompressedTextureUploader';
import type { WgpuMaterialRenderer } from './WgpuMaterialRenderer';
import type { WgpuMeshMaterialRenderer } from './WgpuMeshMaterialRenderer';
import type { WgpuRenderTarget } from './WgpuRenderTarget';
import type { WgpuRenderTextureEntry } from './WgpuRenderTexture';
import type { WgpuTextureResolver } from './WgpuTextureResolver';

export interface WgpuRenderState extends RenderState {
  applyBlendMode: ((state: WgpuRenderState, blendMode: BlendMode | null) => void) | null;
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
}

// The opt-in inline color-adjustment fold for the WebGPU sprite/quad batch. Installed on the runtime
// by registerWgpuColorAdjustmentMaterialFeature; absent (null) on a state that never opted in, so the base batch — which
// only ever reaches this through the nullable runtime slot — carries none of the fold's WGSL and
// tree-shakes it out. `record` folds one instance's color adjustment into the active batch's
// promote-not-split state machine; `resolveFlush` returns the group-3 storage data + folded shader
// module for a tinted batch (or null when the batch has no adjustment, so the caller runs the lean
// material path). This is the generic capability seam — color adjustment is its first consumer.
export interface WgpuColorAdjustmentMaterialFeature {
  // The one backend-authored pointwise color-remap implementation, spliced only into promoted
  // material-family variants. It lives on the registered feature to preserve bundle shake-out.
  readonly fragmentShaderChunk: string;
  readonly matrixFragmentShaderChunk: string;
  record(
    runtime: WgpuRenderStateRuntime,
    colorScaleBias: ColorScaleBias | TintMaterialData | readonly number[] | null | undefined,
    instanceIndex: number,
  ): void;
  resolveFlush(state: WgpuRenderState, count: number): WgpuColorAdjustmentFlush | null;
}

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
export interface WgpuRenderStateRuntime extends RenderStateRuntime {
  // Active blend mode tracked to avoid redundant pipeline rebinds. Internal — formerly public on the
  // WgpuRenderState entity.
  currentBlendMode: BlendMode | null;

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
  // that tile or mip go through samplerCache, keyed by a NUMBER that bit-packs filter/wrapU/wrapV/mipmap/
  // anisotropy (getWgpuSampler) — a number, not a template string, so the per-bind lookup that runs every
  // frame allocates nothing. A GPUSampler's address mode, mip filter, and anisotropy are immutable and
  // must be chosen at bind-group creation.
  linearSampler: GPUSampler;
  nearestSampler: GPUSampler;
  samplerCache: Map<number, GPUSampler>;

  // Lazily-built downsample render pipeline and its bind-group layout for GPU mip-chain generation.
  // WebGPU has no generateMipmap, so a mipmapped material texture's lower levels are rendered by
  // repeatedly downsampling the level above through this pipeline. Null until the first such upload.
  mipmapPipeline?: GPURenderPipeline | null;
  mipmapBindGroupLayout?: GPUBindGroupLayout | null;

  // Raw-element texture cache: a canvas/video/image element uploaded directly, keyed by the element.
  textureCache: WeakMap<CanvasImageSource, WgpuTextureEntry>;
  // Premultiplied texture realizations for TextureSource siblings. Keyed by stable entity identity and
  // guarded by content version so mutable Bitmaps re-upload in place.
  textureSourcePremultipliedTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  // Straight (upload-as-is) sibling used by the straight-blend 3D path and native compressed images.
  textureSourceStraightTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  // Optional block-compressed upload and CPU-decode seams. The uploader is installed explicitly so
  // ordinary bitmap bundles do not retain the format table; the decoder is consulted only when the
  // device lacks the container's native family.
  compressedTextureDecoder?: WgpuCompressedTextureDecoder | null;
  compressedTextureUpload?: WgpuCompressedTextureUploader | null;
  // Dynamic host-video cache. The GPU texture persists across frames; uploadedVersion gates the
  // expensive external-image copy, while width/height detect mid-stream resolution changes.
  videoTextureCache?: WeakMap<ImageResource, WgpuVideoTextureEntry>;
  // Open, state-scoped Texture source registry keyed by the source's declared string kind.
  // Map.set is last-write-wins; undefined until first registration.
  wgpuTextureResolverRegistry?: Map<TextureSourceKind, WgpuTextureResolver> | null;
  // Borrowed native handles and derived non-owning views/bind groups. Disposal only forgets the entry.
  wgpuExternalTextureCache?: WeakMap<Texture, WgpuTextureEntry>;
  // Render Texture realizations are keyed by Texture because their GPU allocation is state-bound.
  wgpuRenderTextureCache?: WeakMap<RenderTexture, WgpuRenderTextureEntry>;

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
  // The opt-in color-adjustment fold and its guard, both null until registerWgpuColorAdjustmentMaterialFeature /
  // enableWgpuColorAdjustmentGuards installs them. recordWgpuQuadBatchColorScaleBias reaches the fold
  // only through this slot, so the base batch statically references neither its WGSL nor a message.
  wgpuColorAdjustmentMaterialFeature?: WgpuColorAdjustmentMaterialFeature | null;
  wgpuColorAdjustmentMaterialFeatureGuard?:
    | ((
        state: WgpuRenderState,
        colorScaleBias: Readonly<ColorScaleBias | TintMaterialData | readonly number[]>,
      ) => void)
    | null;
  // Per-frame pool of GPU storage buffers, one slot claimed per flush. The batch records draws into
  // the canvas pass, but the pass is submitted once at end of frame, so every flush's draw reads its
  // buffers at submit time. Reusing a single buffer across flushes would leave them all reading the
  // last flush's data — the whole batch collapsing onto one position. Each flush claims a distinct
  // slot instead; the cursor resets per frame and slots are reused across frames, which is safe
  // because a frame's writeBuffer is queued after the previous frame's submit completes.
  quadBatchWriterBufferPool: WgpuQuadBatchWriterBufferSlot[];
  quadBatchWriterBufferCursor: number;
  materialRendererMap?: Map<Kind, WgpuMaterialRenderer>;

  // 3D scene mesh-material seam, owned by scene-wgpu (filled lazily by
  // registerWgpuMeshMaterialRenderer). The per-material-kind 3D draw behavior registry, kept separate
  // from the 2D materialRendererMap because a material kind is either 2D or 3D, never both.
  // sceneMeshUploadCache is the per-state cache of lazily uploaded MeshGeometry GPU data, keyed by the
  // geometry entity (parallel to MeshGeometryRuntime.webgpuData; scene-wgpu owns and casts the
  // concrete value shape). Both stay null until the first 3D registration / mesh draw on this state.
  sceneMeshMaterialRegistry?: Map<Kind, WgpuMeshMaterialRenderer> | null;
  sceneMeshUploadCache?: WeakMap<object, object> | null;

  // Frame state: command encoder and current render pass
  commandEncoder: GPUCommandEncoder | null;
  renderPass: GPURenderPassEncoder | null;

  // Canvas surface — cached per frame to avoid calling getCurrentTexture twice
  canvasTextureView: GPUTextureView | null;
  canvasViewCleared: boolean;

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

// Per-shape reusable GPU buffers for the tessellated solid-fill path, cached on the shape's
// rendererData. Grown by recreating when a mesh needs more room; uploaded each draw via writeBuffer;
// destroyed in destroyData. Avoids per-frame create/destroy churn and the buffer-lifetime hazards it
// brings.
export interface WgpuShapeMeshBuffers {
  vertexBuffer: GPUBuffer | null;
  vertexCapacity: number;
  indexBuffer: GPUBuffer | null;
  indexCapacity: number;
  uniformBuffer: GPUBuffer | null;
  bindGroup: GPUBindGroup | null;
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

// An uploaded GPU texture and its derived view + bind group, cached per image source in the
// WgpuRenderState runtime's textureCache.
export interface WgpuTextureEntry {
  bindGroup: GPUBindGroup;
  // Lazily-built group(1) bind group variants for per-bitmap smoothing (2D path): the linear-sampler and
  // nearest-sampler forms over this entry's `view`, so a NEAREST bitmap and a LINEAR one sharing a texture
  // each sample with their own filter without rebuilding the whole entry. Cleared when the texture/view is
  // re-uploaded (version bump). Absent for callers that pass no smoothing override (they use `bindGroup`).
  bindGroupLinear?: GPUBindGroup;
  bindGroupNearest?: GPUBindGroup;
  // True when sampled RGB is straight-alpha and the 2D display shader must premultiply it before
  // applying color adjustments/blending. Native compressed blocks cannot be premultiplied in place.
  straightAlpha?: boolean;
  texture: GPUTexture;
  view: GPUTextureView;
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
