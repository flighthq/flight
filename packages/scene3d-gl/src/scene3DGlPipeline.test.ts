import { getRegistryTableKeys } from '@flighthq/registry/contract';
import { glScene2DRenderRegistries } from '@flighthq/scene2d-gl/contract';
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

import { glScene3DRenderRegistries } from './scene3DGlPipeline';

function expectExactKeys(table: Readonly<KeyedTable<unknown>>, expected: readonly Kind[]): void {
  const actual: Kind[] = [];
  getRegistryTableKeys(actual, table);
  expect(actual).toEqual(expected);
  expect(table.entries.size).toBe(expected.length);
}

describe('glScene3DRenderRegistries', () => {
  it('inherits every unchanged Scene2D GL registry table', () => {
    const scene2D = { ...glScene2DRenderRegistries };
    const scene3D = { ...glScene3DRenderRegistries };
    expect(scene3D.blendRealizations).toBe(scene2D.blendRealizations);
    expect(scene3D.compressedTextureDecoder).toBe(scene2D.compressedTextureDecoder);
    expect(scene3D.compressedTextureUpload).toBe(scene2D.compressedTextureUpload);
    expect(scene3D.customEffectShaders).toBe(scene2D.customEffectShaders);
    expect(scene3D.customMaterialShaders).toBe(scene2D.customMaterialShaders);
    expect(scene3D.materialRenderers).toBe(scene2D.materialRenderers);
    expect(scene3D.effects).toBe(scene2D.effects);
    expect(scene3D.nodeRenderers).toBe(scene2D.nodeRenderers);
    expect(scene3D.shapeRasterizer).toBe(scene2D.shapeRasterizer);
    expect(scene3D.strokeTessellator).toBe(scene2D.strokeTessellator);
    expect(scene3D.textureResolvers).toBe(scene2D.textureResolvers);
    expect(scene3D.velocityWriters).toBe(scene2D.velocityWriters);
  });

  it('carries exactly the sixteen standard GL mesh material renderers', () => {
    expectExactKeys(glScene3DRenderRegistries.meshMaterialRenderers, [
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
    expectExactKeys(glScene3DRenderRegistries.pbrExtensions, [
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
    expectExactKeys(glScene3DRenderRegistries.modifierSnippets, [
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
    expectExactKeys(glScene3DRenderRegistries.textureResolvers, [
      BitmapTextureSourceKind,
      ImageTextureSourceKind,
      RenderTargetTextureSourceKind,
    ]);
  });
});
