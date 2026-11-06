// Exact bridge for the GL/WGPU backend owner contract lanes (render-gl, scene2d-gl, effects-gl, effects-wgpu).
// Restores the entry these lanes resolved before the render-wgpu bridge was narrowed; selected through the
// `.render-backend-bridge-types` module suffix.
export type { Camera3D } from './Camera3D.ts';
export type { CompressedImageResource } from './CompressedImageResource.ts';
export type {
  RenderRegistries,
  RenderState,
  RenderStateRuntime,
  Scene3DGraphSyncPolicy,
  ShapeRasterizer,
} from './contract.scene2d-dom-types.ts';
export type { ColorScaleBias, RenderProxy2D } from './contract.scene2d-wgpu-bridge-types.ts';
export type { ImageResource } from './ImageResource.ts';
export type { TintMaterialData } from './TintMaterialData.ts';
export type { EffectStateOptions } from '@flighthq/effects/contract';
export type { Entity } from './Entity.ts';
export type { Texture } from './Texture.ts';
export type { Effect } from './Effect.ts';
export type { EntityRuntime } from './Entity.ts';
export type { ExternalTexture } from './ExternalTexture.ts';
export type { HostCanvasCapability } from './HostCanvas.ts';
export type { HostImageCapability } from './ImageResource.ts';
export type { GlColorAdjustmentResources } from './GlColorAdjustmentResources.render-wgpu-types.ts';
export type { GlCompressedTextureDecoder } from './GlCompressedTextureDecoder.ts';
export type { GlCompressedTextureUploader } from './GlCompressedTextureUploader.ts';
export type { GlCustomMaterialShaderSource } from './GlCustomMaterialShaderSource.ts';
export type { GlEffectRegistration } from './GlEffectRegistration.render-wgpu-types.ts';
export type { GlMeshMaterialRenderer } from './GlMeshMaterialRenderer.ts';
export type { GlModifierSnippet } from './GlModifierSnippet.ts';
export type { GlParticleResources } from './GlParticleResources.render-wgpu-types.ts';
export type { GlPbrExtensionBindContext } from './GlPbrExtensionBindContext.ts';
export type { GlPbrExtensionRegistration } from './GlPbrExtensionRegistration.ts';
export type { GlPbrExtensionShaderContext } from './GlPbrExtensionShaderContext.ts';
export type { GlPbrExtensionShaderContribution } from './GlPbrExtensionShaderContribution.ts';
export type { GlQuadBatchResources } from './GlQuadBatchResources.render-wgpu-types.ts';
export type { GlQuadMaterialRenderer } from './GlQuadMaterialRenderer.ts';
export type { GlRenderPass } from './GlRenderPass.ts';
export type {
  GlColorScaleBiasInstancedShader,
  GlParticleShader,
  GlQuadBatchShader,
  GlRenderState,
  GlShapeMeshColorScaleBiasShader,
  GlUniformColorScaleBiasShader,
} from './GlRenderState.ts';
export type { GlRenderTextureEntry, GlRenderTextureGuard } from './GlRenderTexture.ts';
export type { GlScene3DPass } from './GlScene3DRuntime.ts';
export type { GlBitmapShader, GlShaderLocations } from './GlShaderLocations.ts';
export type { GlShapeMesh } from './GlShapeMesh.render-wgpu-types.ts';
export type { GlShapeMeshResources } from './GlShapeMeshResources.render-wgpu-types.ts';
export type { GlTextureRealization, GlTextureResolver } from './GlTextureResolver.ts';
export type { GlTextureRenderTarget, GlTextureRenderTargetPool } from './GlRenderTarget.ts';
export type { GlVelocityWriter } from './GlVelocityWriter.ts';
export type { Material, MaterialData } from './Material.ts';
export type { Mesh, MeshGeometry } from '@flighthq/meshgeometry/contract';
export type { Modifier } from './Modifier.ts';
export type { ModifierDefinition } from './ModifierDefinition.ts';
export type { Node3D } from './Node3D.ts';
export type { PlatformEndianness } from '@flighthq/platform/contract';
export type { PbrExtension } from './PbrExtension.ts';
export type { RenderStateOptions } from './RenderStateOptions.ts';
export type {
  RenderTargetAxes,
  RenderTargetColorSpace,
  RenderTargetDepth,
  RenderTargetDimensions,
  RenderTargetFormat,
} from './RenderTarget.ts';
export type { RenderTexture } from './RenderTexture.ts';
export type { SamplerLike } from './Sampler.ts';
export type { Scene3DLightBlock } from './Scene3DLightBlock.ts';
export type { Scene3DLightsLike } from './Scene3DLights.ts';
export type { Scene3DRenderProxy } from './Scene3DRenderProxy.ts';
export type { Signal } from '@flighthq/signals/contract';
export type { NativeSurfaceHandle, Surface } from './Surface.ts';
export type { TextureColorSpace, TextureLike } from './Texture.ts';
export type { TextureContainerFormat } from './TextureContainerFormat.ts';
export type { TextureSource } from './TextureSource.ts';
export type { VelocityField } from './Velocity.ts';
export type {
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
} from './WgpuColorAdjustmentMaterialFeature.scene2d-wgpu-bridge-types.ts';
export type { BlendMode } from './BlendMode.ts';
export type { Kind } from './Entity.ts';
