import type { Kind } from './Entity.ts';
import type { RenderStateOptions } from './RenderStateOptions.ts';
import type { ShapeRasterizer } from './ShapeRasterizer.ts';
import type { WgpuCompressedTextureDecoder } from './WgpuCompressedTextureDecoder.ts';
import type { WgpuCompressedTextureUploader } from './WgpuCompressedTextureUploader.ts';
import type { WgpuCustomMaterialShaderSource } from './WgpuCustomMaterialShaderSource.ts';
import type { WgpuEffectRegistration } from './WgpuEffectState.ts';
import type { WgpuMeshMaterialRenderer } from './WgpuMeshMaterialRenderer.ts';
import type { WgpuModifierSnippet } from './WgpuModifierSnippet.ts';
import type { WgpuQuadMaterialRenderer } from './WgpuQuadMaterialRenderer.ts';
import type { WgpuRenderOptions } from './WgpuRenderOptions.ts';
import type { WgpuColorAdjustmentMaterialFeature, WgpuColorAdjustmentMaterialFeatureGuard } from './WgpuRenderState.ts';
import type { WgpuScene3DPass } from './WgpuScene3DRuntime.ts';
import type { WgpuSkinningAdapter } from './WgpuSkinningAdapter.ts';
import type { WgpuTextureResolver } from './WgpuTextureResolver.ts';
import type { WgpuVelocityWriter } from './WgpuVelocityWriter.ts';

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
