import { getKindMapKeys } from '@flighthq/registry/contract';
import {} from '@flighthq/render-wgpu/contract';
import { wgpuScene2DRenderPreset } from '@flighthq/scene2d-wgpu/contract';
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

import { wgpuScene3DRenderPreset } from './scene3DWgpuPipeline';
import { getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { wgpuSkinningAdapter } from './wgpuSkinPalette';

function registryKeys(table: ReadonlyMap<string, unknown>): string[] {
  const keys: string[] = [];
  getKindMapKeys(keys, table);
  return keys;
}

describe('wgpuScene3DRenderPreset', () => {
  const registries = wgpuScene3DRenderPreset;
  const scene2dRegistries = wgpuScene2DRenderPreset;

  it('retains the complete standard Scene2D registry surface', () => {
    expect(registries.nodeRenderers).toBe(scene2dRegistries.nodeRenderers);
    expect(registryKeys(registries.nodeRenderers)).toEqual([
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
  });

  it('carries the standard quad-material and every supported mesh-material renderer', () => {
    expect(registryKeys(registries.materialRenderers)).toEqual([
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
      StandardMaterialKind,
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
    expect(registries.gpuSkinning).toEqual(wgpuSkinningAdapter);

    const { state } = makeWgpuScene3DState(wgpuScene3DRenderPreset);
    expect(getWgpuSkinningAdapter(state)).toBe(wgpuSkinningAdapter);
  });

  it('is frozen so late-register calls cannot mutate a shared preset', () => {
    expect(Object.isFrozen(wgpuScene3DRenderPreset)).toBe(true);
  });

  it('does not claim GL-only Extended PBR support', () => {
    expect(registries.materialRenderers.has(ExtendedPbrMaterialKind)).toBe(false);
    expect('pbrExtensions' in registries).toBe(false);
  });
});
