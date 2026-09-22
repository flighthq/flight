import type { Kind } from './Entity';
import type { GlCompressedTextureDecoder } from './GlCompressedTextureDecoder';
import type { GlCompressedTextureUploader } from './GlCompressedTextureUploader';
import type { GlCustomMaterialShaderSource } from './GlCustomMaterialShaderSource';
import type { GlEffectRegistration } from './GlEffectState';
import type { GlMeshMaterialRenderer } from './GlMeshMaterialRenderer';
import type { GlModifierSnippet } from './GlModifierSnippet';
import type { GlPbrExtensionRegistration } from './GlPbrExtensionRegistration';
import type { GlQuadMaterialRenderer } from './GlQuadMaterialRenderer';
import type { GlRenderOptions } from './GlRenderOptions';
import type {
  GlBlendRealization,
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentMaterialFeatureGuard,
} from './GlRenderState';
import type { GlScene3DPass } from './GlScene3DRuntime';
import type { GlTextureResolver } from './GlTextureResolver';
import type { GlVelocityWriter } from './GlVelocityWriter';
import type { RenderStateOptions } from './RenderStateOptions';
import type { ShapeRasterizer } from './ShapeRasterizer';

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
