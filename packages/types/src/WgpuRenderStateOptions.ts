import type { Kind } from './Entity';
import type { RenderStateOptions } from './RenderStateOptions';
import type { ShapeRasterizer } from './ShapeRasterizer';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder';
import type { WgpuCompressedTextureUploader } from './WgpuCompressedTextureUploader';
import type { WgpuCustomMaterialShaderSource } from './WgpuCustomMaterialShaderSource';
import type { WgpuEffectRegistration } from './WgpuEffectState';
import type { WgpuMeshMaterialRenderer } from './WgpuMeshMaterialRenderer';
import type { WgpuModifierSnippet } from './WgpuModifierSnippet';
import type { WgpuQuadMaterialRenderer } from './WgpuQuadMaterialRenderer';
import type { WgpuRenderOptions } from './WgpuRenderOptions';
import type { WgpuColorAdjustmentMaterialFeature, WgpuColorAdjustmentMaterialFeatureGuard } from './WgpuRenderState';
import type { WgpuScene3DPass } from './WgpuScene3DRuntime';
import type { WgpuSkinningAdapter } from './WgpuSkinningAdapter';
import type { WgpuTextureResolver } from './WgpuTextureResolver';
import type { WgpuVelocityWriter } from './WgpuVelocityWriter';

export interface WgpuRenderStateOptions extends RenderStateOptions, WgpuRenderOptions {
  colorAdjustmentFeature?: WgpuColorAdjustmentMaterialFeature | null;
  colorAdjustmentFeatureGuard?: WgpuColorAdjustmentMaterialFeatureGuard | null;
  compressedTextureDecoder?: WgpuCompressedTextureDecoder | null;
  compressedTextureUpload?: WgpuCompressedTextureUploader | null;
  customMaterialShaders?: ReadonlyMap<Kind, WgpuCustomMaterialShaderSource>;
  effects?: ReadonlyMap<Kind, WgpuEffectRegistration>;
  gpuSkinning?: WgpuSkinningAdapter | null;
  materialRenderers?: ReadonlyMap<Kind, WgpuMeshMaterialRenderer | WgpuQuadMaterialRenderer>;
  modifierSnippets?: ReadonlyMap<Kind, WgpuModifierSnippet>;
  passes?: readonly WgpuScene3DPass[] | null;
  shapeRasterizer?: ShapeRasterizer | null;
  textureResolvers?: ReadonlyMap<Kind, WgpuTextureResolver>;
  velocityWriters?: ReadonlyMap<Kind, WgpuVelocityWriter>;
}
