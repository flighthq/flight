import type { EntityRuntime } from '@flighthq/entity/contract';
import type { ImageResource } from '@flighthq/image/contract';
import type { TextureSource } from '@flighthq/texture/contract';
import type { ExternalTexture, RenderTexture } from '@flighthq/types/contract';

import type { WgpuDeviceSignals } from './WgpuDeviceSignals.ts';
import type { WgpuParticleResources } from './WgpuParticleResources.ts';
import type { WgpuQuadBatchResources } from './WgpuQuadBatchResources.ts';
import type {
  WgpuShapeMeshPipeline,
  WgpuTextureEntry,
  WgpuTextureSourceTextureEntry,
  WgpuVideoTextureEntry,
} from './WgpuRenderState.ts';
import type { WgpuRenderTextureEntry } from './WgpuRenderTexture.ts';

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
  videoTextureCache?: WeakMap<ImageResource, WgpuVideoTextureEntry>;
  videoSrgbTextureCache?: WeakMap<ImageResource, WgpuVideoTextureEntry>;
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
