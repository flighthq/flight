// Compatibility bridge for backend contract projects. Render GL now owns every GL-specific header;
// only render-agnostic modifier contracts arrive from Shading.
export type {
  GlBitmapShader,
  GlColorAdjustmentResources,
  GlEffectRegistration,
  GlParticleResources,
  GlPbrExtensionBindContext,
  GlPbrExtensionShaderContext,
  GlPbrExtensionShaderContribution,
  GlQuadBatchResources,
  GlScene3DPass,
  GlShaderLocations,
  GlShapeMesh,
  GlShapeMeshResources,
  GlVelocityWriter,
} from '@flighthq/render-gl/contract';
export type { Modifier, ModifierDefinition } from '@flighthq/shading/contract';
