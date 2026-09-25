import type { Kind } from './Entity.ts';
import type { GlCompressedTextureDecoder } from './GlCompressedTextureDecoder.ts';
import type { GlCompressedTextureUploader } from './GlCompressedTextureUploader.ts';
import type { GlCustomMaterialShaderSource } from './GlCustomMaterialShaderSource.ts';
import type { GlEffectRegistration } from './GlEffectState.ts';
import type { GlMeshMaterialRenderer } from './GlMeshMaterialRenderer.ts';
import type { GlModifierSnippet } from './GlModifierSnippet.ts';
import type { GlPbrExtensionRegistration } from './GlPbrExtensionRegistration.ts';
import type { GlQuadMaterialRenderer } from './GlQuadMaterialRenderer.ts';
import type { GlRenderOptions } from './GlRenderOptions.ts';
import type {
  GlBlendRealization,
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentMaterialFeatureGuard,
} from './GlRenderState.ts';
import type { GlScene3DPass } from './GlScene3DRuntime.ts';
import type { GlTextureResolver } from './GlTextureResolver.ts';
import type { GlVelocityWriter } from './GlVelocityWriter.ts';
import type { RenderStateOptions } from './RenderStateOptions.ts';
import type { ShapeRasterizer } from './ShapeRasterizer.ts';

export interface GlRenderStateOptions extends RenderStateOptions, GlRenderOptions {
  blendRealizations?: ReadonlyMap<Kind, GlBlendRealization>;
  colorAdjustmentFeature?: GlColorAdjustmentMaterialFeature | null;
  colorAdjustmentFeatureGuard?: GlColorAdjustmentMaterialFeatureGuard | null;
  compressedTextureDecoder?: GlCompressedTextureDecoder | null;
  compressedTextureUpload?: GlCompressedTextureUploader | null;
  customEffectShaders?: ReadonlyMap<Kind, string>;
  customMaterialShaders?: ReadonlyMap<Kind, GlCustomMaterialShaderSource>;
  effects?: ReadonlyMap<Kind, GlEffectRegistration>;
  materialRenderers?: ReadonlyMap<Kind, GlMeshMaterialRenderer | GlQuadMaterialRenderer>;
  modifierSnippets?: ReadonlyMap<Kind, GlModifierSnippet>;
  passes?: readonly GlScene3DPass[] | null;
  pbrExtensions?: ReadonlyMap<Kind, GlPbrExtensionRegistration>;
  shapeRasterizer?: ShapeRasterizer | null;
  textureResolvers?: ReadonlyMap<Kind, GlTextureResolver>;
  velocityWriters?: ReadonlyMap<Kind, GlVelocityWriter>;
}
