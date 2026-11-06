// Exact bridge for the Render-WGPU owner contract. Most dependencies now arrive from their owning
// package contracts; only Types-owned scene/render headers and the two genuine backend cycles remain.
export type { Camera3D } from './Camera3D.ts';
export type { ExternalTexture } from './ExternalTexture.ts';
export type { Mesh, MeshGeometry } from '@flighthq/meshgeometry/contract';
export type { Modifier } from './Modifier.ts';
export type { ModifierDefinition } from './ModifierDefinition.ts';
export type { Node3D } from './Node3D.ts';
export type { RenderProxy2D } from './RenderProxy2D.ts';
export type { RenderRegistries, RenderState, RenderStateRuntime, Scene3DGraphSyncPolicy } from './RenderState.ts';
export type { RenderStateOptions } from './RenderStateOptions.ts';
export type { RenderTargetColorSpace, RenderTargetDimensions } from './RenderTarget.ts';
export type { RenderTexture } from './RenderTexture.ts';
export type { Scene3DLightBlock } from './Scene3DLightBlock.ts';
export type { Scene3DLightsLike } from './Scene3DLights.ts';
export type { Scene3DRenderProxy } from './Scene3DRenderProxy.ts';
export type { ShapeRasterizer } from './ShapeRasterizer.ts';
export type {
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
} from './WgpuColorAdjustmentMaterialFeature.scene2d-wgpu-bridge-types.ts';
