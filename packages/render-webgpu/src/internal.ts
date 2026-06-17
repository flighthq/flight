import type { BlendMode, Material, Matrix, WebGPUMaterialRenderer, WebGPURenderState } from '@flighthq/types';

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
  spriteBatchInstanceBuffer: GPUBuffer | null;
  spriteBatchInstanceCapacity: number;
  spriteBatchInstanceData: Float32Array;
  // Parallel per-instance material buffer (instanceFloatCount floats per instance), written by the
  // active material's packInstance. Separate from the base instance buffer so the base layout carries
  // no material concern.
  spriteBatchMaterialBuffer: GPUBuffer | null;
  spriteBatchMaterialCapacity: number;
  spriteBatchMaterialData: Float32Array;
  spriteBatchTexture: CanvasImageSource | null;
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

  // Mask state
  currentMaskDepth: number;
  maskWriteMode: boolean;

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

export interface WebGPUSavedPassState {
  canvasTextureView: GPUTextureView | null;
  canvasViewCleared: boolean;
  depthStencilView: GPUTextureView | null;
  renderTargetViewport: { width: number; height: number } | null;
  renderTransform2D: Matrix | null;
}
