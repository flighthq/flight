// Exact bridge for render-gl's genuine owner cycles. Scene2D/Scene3D/effect registrations flow back
// into render-gl state, while the remaining shader, modifier, and velocity headers are still Types-owned.
export type { GlColorAdjustmentResources } from './GlColorAdjustmentResources.render-wgpu-types.ts';
export type { GlParticleResources } from './GlParticleResources.render-wgpu-types.ts';
export type { GlQuadBatchResources } from './GlQuadBatchResources.render-wgpu-types.ts';
export type { GlEffectRegistration } from './GlEffectRegistration.render-wgpu-types.ts';
export type { GlPbrExtensionBindContext } from './GlPbrExtensionBindContext.scene3d-gl-bridge-types.ts';
export type { GlPbrExtensionShaderContext } from './GlPbrExtensionShaderContext.scene3d-gl-bridge-types.ts';
export type { GlPbrExtensionShaderContribution } from './GlPbrExtensionShaderContribution.scene3d-gl-bridge-types.ts';
export type { GlScene3DPass } from './GlScene3DRuntime.scene3d-gl-bridge-types.ts';
export type { GlBitmapShader, GlShaderLocations } from './GlShaderLocations.ts';
export type { GlShapeMesh } from './GlShapeMesh.render-wgpu-types.ts';
export type { GlShapeMeshResources } from './GlShapeMeshResources.render-wgpu-types.ts';
export type { GlVelocityWriter } from './GlVelocityWriter.ts';
export type { Modifier } from './Modifier.ts';
export type { ModifierDefinition } from './ModifierDefinition.ts';
