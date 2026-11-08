import type { WgpuBindGroup, WgpuBindGroupDescriptor } from './WgpuBindGroup.ts';
import type { WgpuBindGroupLayout, WgpuBindGroupLayoutDescriptor } from './WgpuBindGroupLayout.ts';
import type { WgpuBuffer, WgpuBufferDescriptor } from './WgpuBuffer.ts';
import type { WgpuCommandEncoder, WgpuCommandEncoderDescriptor } from './WgpuCommandEncoder.ts';
import type { WgpuPipelineLayout, WgpuPipelineLayoutDescriptor } from './WgpuPipelineLayout.ts';
import type { WgpuQueue } from './WgpuQueue.ts';
import type { WgpuRenderPipeline, WgpuRenderPipelineDescriptor } from './WgpuRenderPipeline.ts';
import type { WgpuSampler, WgpuSamplerDescriptor } from './WgpuSampler.ts';
import type { WgpuShaderModule, WgpuShaderModuleDescriptor } from './WgpuShaderModule.ts';
import type { WgpuTexture, WgpuTextureDescriptor } from './WgpuTexture.ts';

// The device members portable WGPU code calls, typed in Flight's own vocabulary so no portable package
// names a browser type. A browser GPUDevice satisfies it directly, as WebGL2RenderingContext satisfies
// GlContext; a native host wraps its device to present the same members.
export interface WgpuDevice {
  readonly features: WgpuSupportedFeatures;
  readonly limits: WgpuSupportedLimits;
  readonly lost: Promise<WgpuDeviceLostInfo>;
  readonly queue: WgpuQueue;
  createBindGroup(descriptor: Readonly<WgpuBindGroupDescriptor>): WgpuBindGroup;
  createBindGroupLayout(descriptor: Readonly<WgpuBindGroupLayoutDescriptor>): WgpuBindGroupLayout;
  createBuffer(descriptor: Readonly<WgpuBufferDescriptor>): WgpuBuffer;
  createCommandEncoder(descriptor?: Readonly<WgpuCommandEncoderDescriptor>): WgpuCommandEncoder;
  createPipelineLayout(descriptor: Readonly<WgpuPipelineLayoutDescriptor>): WgpuPipelineLayout;
  createRenderPipeline(descriptor: Readonly<WgpuRenderPipelineDescriptor>): WgpuRenderPipeline;
  createSampler(descriptor?: Readonly<WgpuSamplerDescriptor>): WgpuSampler;
  createShaderModule(descriptor: Readonly<WgpuShaderModuleDescriptor>): WgpuShaderModule;
  createTexture(descriptor: Readonly<WgpuTextureDescriptor>): WgpuTexture;
  destroy(): void;
}

export interface WgpuDeviceDescriptor {
  defaultQueue?: Readonly<WgpuQueueDescriptor>;
  label?: string;
  requiredFeatures?: readonly WgpuFeatureName[];
  requiredLimits?: Readonly<Record<string, number | undefined>>;
}

export interface WgpuDeviceLostInfo {
  readonly message: string;
  readonly reason: WgpuDeviceLostReason;
}

export type WgpuDeviceLostReason = 'destroyed' | 'unknown';

export type WgpuFeatureName =
  | 'bgra8unorm-storage'
  | 'clip-distances'
  | 'core-features-and-limits'
  | 'depth-clip-control'
  | 'depth32float-stencil8'
  | 'dual-source-blending'
  | 'float32-blendable'
  | 'float32-filterable'
  | 'indirect-first-instance'
  | 'primitive-index'
  | 'rg11b10ufloat-renderable'
  | 'shader-f16'
  | 'subgroups'
  | 'texture-component-swizzle'
  | 'texture-compression-astc'
  | 'texture-compression-astc-sliced-3d'
  | 'texture-compression-bc'
  | 'texture-compression-bc-sliced-3d'
  | 'texture-compression-etc2'
  | 'texture-formats-tier1'
  | 'texture-formats-tier2'
  | 'timestamp-query';

export interface WgpuQueueDescriptor {
  label?: string;
}

// Feature names are open on purpose: an adapter may report names newer than this vocabulary.
export type WgpuSupportedFeatures = ReadonlySet<string>;

export interface WgpuSupportedLimits {
  readonly maxBindGroups: number;
  readonly maxBindGroupsPlusVertexBuffers: number;
  readonly maxBindingsPerBindGroup: number;
  readonly maxBufferSize: number;
  readonly maxColorAttachmentBytesPerSample: number;
  readonly maxColorAttachments: number;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxComputeWorkgroupSizeY: number;
  readonly maxComputeWorkgroupSizeZ: number;
  readonly maxComputeWorkgroupStorageSize: number;
  readonly maxComputeWorkgroupsPerDimension: number;
  readonly maxDynamicStorageBuffersPerPipelineLayout: number;
  readonly maxDynamicUniformBuffersPerPipelineLayout: number;
  readonly maxInterStageShaderVariables: number;
  readonly maxSampledTexturesPerShaderStage: number;
  readonly maxSamplersPerShaderStage: number;
  readonly maxStorageBufferBindingSize: number;
  readonly maxStorageBuffersPerShaderStage: number;
  readonly maxStorageTexturesPerShaderStage: number;
  readonly maxTextureArrayLayers: number;
  readonly maxTextureDimension1D: number;
  readonly maxTextureDimension2D: number;
  readonly maxTextureDimension3D: number;
  readonly maxUniformBufferBindingSize: number;
  readonly maxUniformBuffersPerShaderStage: number;
  readonly maxVertexAttributes: number;
  readonly maxVertexBufferArrayStride: number;
  readonly maxVertexBuffers: number;
  readonly minStorageBufferOffsetAlignment: number;
  readonly minUniformBufferOffsetAlignment: number;
}
