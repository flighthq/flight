import type { ExternalTexture } from './ExternalTexture';
import type { Image } from './Image';
import type { RenderTexture } from './RenderTexture';
import type { TextureSource } from './TextureSource';
import type { WgpuParticleResources } from './WgpuParticleResources';
import type { WgpuQuadBatchResources } from './WgpuQuadBatchResources';
import type { WgpuShapeMeshPipeline } from './WgpuRenderState';
import type { WgpuTextureEntry, WgpuTextureSourceTextureEntry, WgpuVideoTextureEntry } from './WgpuRenderState';
import type { WgpuRenderTextureEntry } from './WgpuRenderTexture';

export interface WgpuDeviceRuntime {
  readonly device: GPUDevice;
  references: number;
  teardowns: Array<(device: GPUDevice) => void>;

  uniformBindGroupLayout: GPUBindGroupLayout;
  textureBindGroupLayout: GPUBindGroupLayout;
  pipelineCache: Map<string, GPURenderPipeline>;
  linearSampler: GPUSampler;
  nearestSampler: GPUSampler;
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
