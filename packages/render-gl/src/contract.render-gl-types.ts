// Acyclic build entry selected by contract-only projects through the `.render-gl-types` module suffix.
// The published @flighthq/render-gl/contract entry remains contract.ts, which also exposes runtime helpers.
export type { GlCompressedTextureDecoder } from '@flighthq/render-gl/compressed-texture-decoder-contract';
export type {
  GlCapabilities,
  GlContext,
  GlContextOptions,
  GlSurface,
  HostGlCapabilities,
  HostGlCapability,
} from './types.ts';
export type { GlCompressedTextureUploader } from './glCompressedTextureUploaderTypes.ts';
export type { GlContextRuntime } from './glContextRuntimeTypes.ts';
export type { GlContextState } from './glContextStateTypes.ts';
export type { GlCustomMaterialShaderSource } from './glCustomMaterialShaderSourceTypes.ts';
export type { GlCubeRenderTarget, GlCubeRenderTargetOptions } from './glCubeRenderTargetTypes.ts';
export type { GlMeshMaterialRenderer } from './glMeshMaterialRendererTypes.ts';
export type { GlModifierBindContext, GlModifierSnippet } from './glModifierSnippetTypes.ts';
export type { GlPbrExtensionRegistration } from './glPbrExtensionRegistrationTypes.ts';
export type { GlQuadMaterialRenderer } from './glQuadMaterialRendererTypes.ts';
export type { GlRenderOptions } from './glRenderOptionsTypes.ts';
export type { GlRenderPass } from './glRenderPassTypes.ts';
export type { GlRenderStateOptions } from './glRenderStateOptionsTypes.ts';
export type {
  GlBlendEquation,
  GlBlendFactor,
  GlBlendRealization,
  GlBlendSignature,
  GlBoundShader,
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentMaterialFeatureGuard,
  GlColorScaleBiasInstancedShader,
  GlParticleShader,
  GlQuadBatchShader,
  GlRenderRegistries,
  GlRenderState,
  GlRenderStateRuntime,
  GlScissorRect,
  GlShapeMeshColorScaleBiasShader,
  GlUniformColorScaleBiasShader,
  GlViewportRect,
} from './glRenderStateTypes.ts';
export type {
  GlRenderTarget,
  GlScreenRenderTarget,
  GlTextureRenderTarget,
  GlTextureRenderTargetPool,
} from './glRenderTargetTypes.ts';
export type {
  GlRenderTextureEntry,
  GlRenderTextureExplanation,
  GlRenderTextureGuard,
  GlRenderTexturePool,
  GlRenderTextureStatus,
} from './glRenderTextureTypes.ts';
export type { GlTextureRealization, GlTextureResolver } from './glTextureResolverTypes.ts';
