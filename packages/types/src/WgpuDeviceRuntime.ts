import type { EntityRuntime } from './Entity';
import type { ExternalTexture } from './ExternalTexture';
import type { Image } from './Image';
import type { RenderTexture } from './RenderTexture';
import type { TextureSource } from './TextureSource';
import type { WgpuDeviceSignals } from './WgpuDeviceSignals';
import type { WgpuParticleResources } from './WgpuParticleResources';
import type { WgpuQuadBatchResources } from './WgpuQuadBatchResources';
import type { WgpuShapeMeshPipeline } from './WgpuRenderState';
import type { WgpuTextureEntry, WgpuTextureSourceTextureEntry, WgpuVideoTextureEntry } from './WgpuRenderState';
import type { WgpuRenderTextureEntry } from './WgpuRenderTexture';

export interface WgpuDeviceRuntime extends EntityRuntime {
  readonly device: GPUDevice;
  references: number;
  teardowns: Array<(device: GPUDevice) => void>;

  // Terminal once set: a lost GPUDevice never comes back, so this is written exactly once and every
  // state sharing the tier reads the same value. Holds BOTH an unexpected loss and the 'destroyed'
  // resolution Flight's own release causes; only the former reaches signals.onDeviceLost.
  lost: GPUDeviceLostInfo | null;
  signals: WgpuDeviceSignals | null;

  resources: WgpuDeviceRuntimeResources | null;
  pipelineCache: Map<string, GPURenderPipeline>;
  samplerCache: Map<number, GPUSampler>;
  mipmapPipelineCache: Map<GPUTextureFormat, { bindGroupLayout: GPUBindGroupLayout; pipeline: GPURenderPipeline }>;
  textureCache: WeakMap<CanvasImageSource, WgpuTextureEntry>;
  textureSourcePremultipliedTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  textureSourcePremultipliedSrgbTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  textureSourceStraightTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  textureSourceStraightSrgbTextureCache: WeakMap<TextureSource, WgpuTextureSourceTextureEntry>;
  videoTextureCache?: WeakMap<Image, WgpuVideoTextureEntry>;
  videoSrgbTextureCache?: WeakMap<Image, WgpuVideoTextureEntry>;
  wgpuExternalTextureCache?: WeakMap<ExternalTexture, WgpuTextureEntry>;
  wgpuRenderTextureCache?: WeakMap<RenderTexture, WgpuRenderTextureEntry>;
  sceneMeshUploadCache?: WeakMap<object, object> | null;
  standardMaterialModule?: GPUShaderModule;
  colorScaleBiasModule?: GPUShaderModule;
  packedTintModule?: GPUShaderModule;
  colorMatrixModule?: GPUShaderModule;
  shapeMeshColorScaleBiasPipelines?: Map<string, WgpuShapeMeshPipeline>;
  particleResources?: WgpuParticleResources;
  quadBatchResources?: WgpuQuadBatchResources;
}

// Device-native objects allocated together on first rendering use. A device owner may exist before any
// render state, so the enclosing WgpuDeviceRuntime carries this block as null until the render path asks
// for it explicitly through getWgpuRenderStateDeviceResources.
export interface WgpuDeviceRuntimeResources {
  readonly linearSampler: GPUSampler;
  readonly nearestSampler: GPUSampler;
  readonly textureBindGroupLayout: GPUBindGroupLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
}
