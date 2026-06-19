import type {
  BlendMode,
  Material,
  Matrix,
  RenderProxy2D,
  WebGPUMaterialRenderer,
  WebGPURenderState,
} from '@flighthq/types';

export interface WebGPUTextureEntry {
  bindGroup: GPUBindGroup;
  texture: GPUTexture;
  view: GPUTextureView;
}

export interface WebGPUScissorRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface WebGPUBitmapShader {
  readonly pipeline: GPURenderPipeline;
  bind(
    state: WebGPURenderStateInternal,
    renderProxy: {
      alpha: number;
    },
  ): void;
}

export type WebGPURenderStateInternal = Omit<WebGPURenderState, 'canvas' | 'device' | 'context' | 'format'> & {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  device: GPUDevice;
  format: GPUTextureFormat;

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

  // Pipeline cache keyed by blend mode + stencil mode + color transform flag
  pipelineCache: Map<string, GPURenderPipeline>;

  // Samplers
  linearSampler: GPUSampler;
  nearestSampler: GPUSampler;

  // Texture cache: image source → entry with texture, view, bind group
  textureCache: WeakMap<CanvasImageSource, WebGPUTextureEntry>;

  // Custom shader (default bitmap shader; can be replaced via registerWebGPUBitmapShader)
  defaultBitmapShader: WebGPUBitmapShader | null;

  // Optional per-node shader-binding resolver. Installed by setWebGPUShader; absent (and tree-shaken
  // with the binding map) until a custom shader is bound to a node.
  webgpuShaderBindingResolver?: (renderProxy: RenderProxy2D) => WebGPUBitmapShader | undefined;

  // Particle instance buffer (grown on demand)
  particleInstanceBuffer: GPUBuffer | null;
  particleInstanceData: Float32Array | null;
  particleInstanceCapacity: number;

  // Universal sprite batch (cross-node batching for Sprite/QuadBatch/Tilemap). The flush key is the
  // material (by reference); the resolved renderer appends its per-instance floats (e.g. color
  // transform) into the single instance storage buffer.
  spriteBatchBlendMode: BlendMode | null;
  spriteBatchMaterial: Material | null;
  spriteBatchMaterialRenderer: WebGPUMaterialRenderer | null;
  spriteBatchMaterialFloats: number;
  spriteBatchCount: number;
  spriteBatchInstanceData: Float32Array;
  // Parallel per-instance material data (instanceFloatCount floats per instance), written by the
  // active material's packInstance. Separate from the base instance data so the base layout carries
  // no material concern.
  spriteBatchMaterialData: Float32Array;
  spriteBatchTexture: CanvasImageSource | null;
  // Per-frame pool of GPU storage buffers, one slot claimed per flush. The batch records draws into
  // the canvas pass, but the pass is submitted once at end of frame, so every flush's draw reads its
  // buffers at submit time. Reusing a single buffer across flushes would leave them all reading the
  // last flush's data — the whole batch collapsing onto one position. Each flush claims a distinct
  // slot instead; the cursor resets per frame and slots are reused across frames, which is safe
  // because a frame's writeBuffer is queued after the previous frame's submit completes.
  spriteBatchBufferPool: WebGPUSpriteBatchBufferSlot[];
  spriteBatchBufferCursor: number;
  materialRendererMap?: Map<symbol, WebGPUMaterialRenderer>;

  // Frame state: command encoder and current render pass
  commandEncoder: GPUCommandEncoder | null;
  renderPass: GPURenderPassEncoder | null;

  // Canvas surface — cached per frame to avoid calling getCurrentTexture twice
  canvasTextureView: GPUTextureView | null;
  canvasViewCleared: boolean;

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
  clipContourPipelines: WebGPUClipContourPipelines | null;
  clipContourStack: WebGPUClipContourEntry[];

  // Lazily-built flat-color pipeline for the GPU tessellated solid-fill shape path (webgpuShapeMesh.ts).
  // Null until the first solid-fill shape draws; shared across every shape on this device.
  shapeMeshPipeline: WebGPUShapeMeshPipeline | null;

  // Clip rectangle scissor stack
  scissorStack: WebGPUScissorRect[];
  currentScissorRect: WebGPUScissorRect | null;

  // Render target viewport override (null = use canvas dimensions)
  renderTargetViewport: { width: number; height: number } | null;

  // Saved render pass state for render target push/pop
  renderTargetStack: WebGPUSavedPassState[];

  // renderTransform2D is already on RenderState but typed as Matrix | null — we refine it here
  renderTransform2D: Matrix | null;

  // Color transform shader (lazily compiled)
  colorTransformBitmapShader?: WebGPUBitmapShader;
};

// One pool slot's GPU buffers, sized lazily and grown by allocating a replacement (the superseded
// buffer is released to GC, never destroyed mid-life, since a prior frame's submit may still
// reference it). materialBuffer stays null until a flush with per-instance material data uses it.
export interface WebGPUSpriteBatchBufferSlot {
  instanceBuffer: GPUBuffer | null;
  instanceCapacity: number;
  materialBuffer: GPUBuffer | null;
  materialCapacity: number;
}

export interface WebGPUSavedPassState {
  canvasTextureView: GPUTextureView | null;
  canvasViewCleared: boolean;
  depthStencilView: GPUTextureView | null;
  renderTargetViewport: { width: number; height: number } | null;
  renderTransform2D: Matrix | null;
}

// Cached stencil pipelines for contour clips: `write` increments covered pixels (open a clip), `erase`
// decrements them (pop). Both are color-less, position-only, and share one uniform bind-group layout.
export interface WebGPUClipContourPipelines {
  write: GPURenderPipeline;
  erase: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

// One active contour clip's GPU resources. Kept on a stack so popWebGPUClipContours can redraw the same
// geometry/uniform to decrement its stencil region, then destroy the buffers.
export interface WebGPUClipContourEntry {
  vertexBuffer: GPUBuffer;
  vertexCount: number;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  depth: number;
}

// Cached flat-color pipeline for the GPU tessellated solid-fill shape path. Position-only vertex
// (@location(0) vec2f), a uniform bind group carrying mat3x3f matrix + vec4f color. Stencil compares
// 'equal' (gated by any active contour clip) and writes nothing, so the fill never disturbs the stencil.
export interface WebGPUShapeMeshPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

// Per-shape reusable GPU buffers for the tessellated solid-fill path, cached on the shape's rendererData.
// Grown by recreating when a mesh needs more room; uploaded each draw via writeBuffer; destroyed in
// destroyData. Avoids per-frame create/destroy churn and the buffer-lifetime hazards it brings.
export interface WebGPUShapeMeshBuffers {
  vertexBuffer: GPUBuffer | null;
  vertexCapacity: number;
  indexBuffer: GPUBuffer | null;
  indexCapacity: number;
  uniformBuffer: GPUBuffer | null;
  bindGroup: GPUBindGroup | null;
}
