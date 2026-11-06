import type { Kind } from '@flighthq/entity/contract';
import type { GlCompressedTextureDecoder } from '@flighthq/render-gl/compressed-texture-decoder-contract';
import type { RenderStateOptions, ShapeRasterizer } from '@flighthq/render/contract';

import type { GlCompressedTextureUploader } from './glCompressedTextureUploaderTypes.ts';
import type { GlCustomMaterialShaderSource } from './glCustomMaterialShaderSourceTypes.ts';
import type { GlMeshMaterialRenderer } from './glMeshMaterialRendererTypes.ts';
import type { GlModifierSnippet } from './glModifierSnippetTypes.ts';
import type { GlEffectRegistration, GlScene3DPass, GlVelocityWriter } from './glOwnerTypes.ts';
import type { GlPbrExtensionRegistration } from './glPbrExtensionRegistrationTypes.ts';
import type { GlQuadMaterialRenderer } from './glQuadMaterialRendererTypes.ts';
import type { GlRenderOptions } from './glRenderOptionsTypes.ts';
import type {
  GlBlendRealization,
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentMaterialFeatureGuard,
} from './glRenderStateTypes.ts';
import type { GlTextureResolver } from './glTextureResolverTypes.ts';

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
