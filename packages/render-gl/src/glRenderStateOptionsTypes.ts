import type {
  GlCompressedTextureDecoder,
  GlCompressedTextureUploader,
  GlCustomMaterialShaderSource,
  GlEffectRegistration,
  GlMeshMaterialRenderer,
  GlModifierSnippet,
  GlPbrExtensionRegistration,
  GlQuadMaterialRenderer,
  GlScene3DPass,
  GlTextureResolver,
  GlVelocityWriter,
  Kind,
  RenderStateOptions,
  ShapeRasterizer,
} from '@flighthq/types/contract';

import type { GlRenderOptions } from './glRenderOptionsTypes.ts';
import type {
  GlBlendRealization,
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentMaterialFeatureGuard,
} from './glRenderStateTypes.ts';

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
