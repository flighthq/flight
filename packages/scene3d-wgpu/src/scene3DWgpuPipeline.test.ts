import { getRegistryTableKeys } from '@flighthq/registry/contract';
import { getWgpuPipelineRegistries } from '@flighthq/render-wgpu/contract';
import { scene2DWgpuPipeline } from '@flighthq/scene2d-wgpu/contract';
import type { RegistryTable } from '@flighthq/types/contract';
import {
  AnimatedNormalModifierKind,
  BitmapTextKind,
  BitmapTextureSourceKind,
  BlinnPhongMaterialKind,
  CustomShaderMaterialKind,
  DepthMaterialKind,
  DisplayObjectKind,
  DissolveModifierKind,
  EmissiveMaterialKind,
  EmissiveModifierKind,
  EntityRuntimeKey,
  EnvReflectModifierKind,
  ExtendedPbrMaterialKind,
  FogModifierKind,
  ImageTextureSourceKind,
  LambertMaterialKind,
  MatcapMaterialKind,
  MorphShapeKind,
  NormalMaterialKind,
  ParticleEmitter2DKind,
  PhongMaterialKind,
  QuadBatchKind,
  RegistryEntryState,
  RenderCacheKind,
  RenderTargetTextureSourceKind,
  RichTextKind,
  RimModifierKind,
  Scale9ShapeKind,
  Scale9SpriteKind,
  ShadedMaterialKind,
  ShapeKind,
  SpecularGlossinessPbrMaterialKind,
  SpriteKind,
  StandardMaterialKind,
  StandardPbrMaterialKind,
  TextLabelKind,
  TilemapKind,
  ToonMaterialKind,
  ToonModifierKind,
  UnlitMaterialKind,
  VertexColorMaterialKind,
  VertexDisplaceModifierKind,
  WireframeMaterialKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { scene3DWgpuPipeline } from './scene3DWgpuPipeline';
import { getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { defaultWgpuSkinningAdapter } from './wgpuSkinPalette';

function registryKeys(table: Readonly<RegistryTable<unknown>>): string[] {
  const keys: string[] = [];
  getRegistryTableKeys(keys, table);
  return keys;
}

describe('scene3DWgpuPipeline', () => {
  const registries = getWgpuPipelineRegistries(scene3DWgpuPipeline);
  const scene2dRegistries = getWgpuPipelineRegistries(scene2DWgpuPipeline);

  it('is an entity and retains the complete standard Scene2D registry surface', () => {
    expect(scene3DWgpuPipeline[EntityRuntimeKey]).toEqual({ binding: null });
    expect(registries.renderers).toBe(scene2dRegistries.renderers);
    expect(registryKeys(registries.renderers)).toEqual([
      BitmapTextKind,
      DisplayObjectKind,
      MorphShapeKind,
      ParticleEmitter2DKind,
      QuadBatchKind,
      RenderCacheKind,
      RichTextKind,
      Scale9ShapeKind,
      Scale9SpriteKind,
      ShapeKind,
      SpriteKind,
      TextLabelKind,
      TilemapKind,
    ]);
    expect(registries.materialRenderers).toBe(scene2dRegistries.materialRenderers);
    expect(registryKeys(registries.materialRenderers)).toEqual([StandardMaterialKind]);
  });

  it('carries exactly every supported standard mesh-material renderer', () => {
    expect(registryKeys(registries.meshMaterialRenderers)).toEqual([
      BlinnPhongMaterialKind,
      CustomShaderMaterialKind,
      DepthMaterialKind,
      EmissiveMaterialKind,
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

  it('carries exactly every supported standard modifier snippet', () => {
    expect(registryKeys(registries.modifierSnippets)).toEqual([
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

  it('carries exactly the standard WGPU texture resolvers', () => {
    expect(registryKeys(registries.textureResolvers)).toEqual([
      BitmapTextureSourceKind,
      ImageTextureSourceKind,
      RenderTargetTextureSourceKind,
    ]);
  });

  it('carries GPU skinning through the pipeline and into state runtime', () => {
    expect(registries.gpuSkinning.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: defaultWgpuSkinningAdapter,
    });

    const { state } = makeWgpuScene3DState(scene3DWgpuPipeline);
    expect(getWgpuSkinningAdapter(state)).toBe(defaultWgpuSkinningAdapter);
  });

  it('does not claim GL-only Extended PBR support', () => {
    expect(registries.meshMaterialRenderers.entries.has(ExtendedPbrMaterialKind)).toBe(false);
    expect('pbrExtensions' in registries).toBe(false);
  });
});
