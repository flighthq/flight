import { getRegistryTableKeys } from '@flighthq/registry/contract';
import { getGlPipelineRegistries } from '@flighthq/render-gl/contract';
import { scene2DGlPipeline } from '@flighthq/scene2d-gl/contract';
import type { KeyedTable, Kind } from '@flighthq/types/contract';
import {
  AnimatedNormalModifierKind,
  AnisotropyPbrExtensionKind,
  BitmapTextureSourceKind,
  BlinnPhongMaterialKind,
  ClearcoatPbrExtensionKind,
  CustomShaderMaterialKind,
  DepthMaterialKind,
  DissolveModifierKind,
  EmissiveMaterialKind,
  EmissiveModifierKind,
  EntityRuntimeKey,
  EnvReflectModifierKind,
  ExtendedPbrMaterialKind,
  FogModifierKind,
  ImageTextureSourceKind,
  IridescencePbrExtensionKind,
  LambertMaterialKind,
  MatcapMaterialKind,
  NormalMaterialKind,
  PhongMaterialKind,
  RenderTargetTextureSourceKind,
  RimModifierKind,
  ShadedMaterialKind,
  SheenPbrExtensionKind,
  SpecularGlossinessPbrMaterialKind,
  SpecularPbrExtensionKind,
  StandardPbrMaterialKind,
  ToonMaterialKind,
  ToonModifierKind,
  TransmissionVolumePbrExtensionKind,
  UnlitMaterialKind,
  VertexColorMaterialKind,
  VertexDisplaceModifierKind,
  WireframeMaterialKind,
  WrappedDiffusePbrExtensionKind,
} from '@flighthq/types/contract';

import { scene3DGlPipeline } from './scene3DGlPipeline';

function expectExactKeys(table: Readonly<KeyedTable<unknown>>, expected: readonly Kind[]): void {
  const actual: Kind[] = [];
  getRegistryTableKeys(actual, table);
  expect(actual).toEqual(expected);
  expect(table.entries.size).toBe(expected.length);
}

describe('scene3DGlPipeline', () => {
  it('is an Entity with EntityRuntimeKey', () => {
    expect(EntityRuntimeKey in scene3DGlPipeline).toBe(true);
  });

  it('inherits every unchanged Scene2D GL registry table', () => {
    const scene2D = getGlPipelineRegistries(scene2DGlPipeline);
    const scene3D = getGlPipelineRegistries(scene3DGlPipeline);
    expect(scene3D.blendRealizations).toBe(scene2D.blendRealizations);
    expect(scene3D.compressedTextureDecoder).toBe(scene2D.compressedTextureDecoder);
    expect(scene3D.compressedTextureUpload).toBe(scene2D.compressedTextureUpload);
    expect(scene3D.customEffectShaders).toBe(scene2D.customEffectShaders);
    expect(scene3D.customMaterialShaders).toBe(scene2D.customMaterialShaders);
    expect(scene3D.materialRenderers).toBe(scene2D.materialRenderers);
    expect(scene3D.renderEffects).toBe(scene2D.renderEffects);
    expect(scene3D.renderers).toBe(scene2D.renderers);
    expect(scene3D.shapeRasterizer).toBe(scene2D.shapeRasterizer);
    expect(scene3D.strokeTessellator).toBe(scene2D.strokeTessellator);
    expect(scene3D.textureResolvers).toBe(scene2D.textureResolvers);
    expect(scene3D.velocityWriters).toBe(scene2D.velocityWriters);
  });

  it('carries exactly the sixteen standard GL mesh material renderers', () => {
    expectExactKeys(getGlPipelineRegistries(scene3DGlPipeline).meshMaterialRenderers, [
      BlinnPhongMaterialKind,
      CustomShaderMaterialKind,
      DepthMaterialKind,
      EmissiveMaterialKind,
      ExtendedPbrMaterialKind,
      LambertMaterialKind,
      MatcapMaterialKind,
      NormalMaterialKind,
      PhongMaterialKind,
      ShadedMaterialKind,
      SpecularGlossinessPbrMaterialKind,
      StandardPbrMaterialKind,
      ToonMaterialKind,
      UnlitMaterialKind,
      VertexColorMaterialKind,
      WireframeMaterialKind,
    ]);
  });

  it('carries exactly the seven standard GL PBR extensions', () => {
    expectExactKeys(getGlPipelineRegistries(scene3DGlPipeline).pbrExtensions, [
      AnisotropyPbrExtensionKind,
      ClearcoatPbrExtensionKind,
      IridescencePbrExtensionKind,
      SheenPbrExtensionKind,
      SpecularPbrExtensionKind,
      TransmissionVolumePbrExtensionKind,
      WrappedDiffusePbrExtensionKind,
    ]);
  });

  it('carries exactly the eight built-in GL modifier snippets', () => {
    expectExactKeys(getGlPipelineRegistries(scene3DGlPipeline).modifierSnippets, [
      AnimatedNormalModifierKind,
      DissolveModifierKind,
      EmissiveModifierKind,
      EnvReflectModifierKind,
      FogModifierKind,
      RimModifierKind,
      ToonModifierKind,
      VertexDisplaceModifierKind,
    ]);
  });

  it('inherits exactly the three standard GL texture resolvers', () => {
    expectExactKeys(getGlPipelineRegistries(scene3DGlPipeline).textureResolvers, [
      BitmapTextureSourceKind,
      ImageTextureSourceKind,
      RenderTargetTextureSourceKind,
    ]);
  });
});
