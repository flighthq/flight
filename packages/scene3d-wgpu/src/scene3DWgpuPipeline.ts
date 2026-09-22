import { concatKindMap, withKindMapEntry } from '@flighthq/registry/contract';
import { standardWgpuTextureResolvers } from '@flighthq/render-wgpu/contract';
import { wgpuScene2DRenderRegistries } from '@flighthq/scene2d-wgpu/contract';
import type {
  Kind,
  WgpuMeshMaterialRenderer,
  WgpuModifierSnippet,
  WgpuQuadMaterialRenderer,
  WgpuRenderRegistries,
  WgpuTextureResolver,
} from '@flighthq/types/contract';
import {
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
} from '@flighthq/types/contract';

import { wgpuBlinnPhongMeshMaterialRenderer } from './wgpuBlinnPhongMeshMaterialRenderer';
import { wgpuCustomShaderMeshMaterialRenderer } from './wgpuCustomShaderMeshMaterialRenderer';
import { wgpuDepthMeshMaterialRenderer } from './wgpuDepthMeshMaterialRenderer';
import { wgpuEmissiveMeshMaterialRenderer } from './wgpuEmissiveMeshMaterialRenderer';
import { wgpuLambertMeshMaterialRenderer } from './wgpuLambertMeshMaterialRenderer';
import { wgpuMatcapMeshMaterialRenderer } from './wgpuMatcapMeshMaterialRenderer';
import { wgpuNormalMeshMaterialRenderer } from './wgpuNormalMeshMaterialRenderer';
import { wgpuPhongMeshMaterialRenderer } from './wgpuPhongMeshMaterialRenderer';
import { wgpuShadedMeshMaterialRenderer } from './wgpuShadedMeshMaterialRenderer';
import {
  animatedNormalWgpuModifierSnippet,
  dissolveWgpuModifierSnippet,
  emissiveWgpuModifierSnippet,
  envReflectWgpuModifierSnippet,
  fogWgpuModifierSnippet,
  rimWgpuModifierSnippet,
  toonWgpuModifierSnippet,
  vertexDisplaceWgpuModifierSnippet,
} from './wgpuShadedPrelude';
import { wgpuSkinningAdapter } from './wgpuSkinPalette';
import { wgpuSpecularGlossinessPbrMeshMaterialRenderer } from './wgpuSpecularGlossinessPbrMeshMaterialRenderer';
import { wgpuStandardPbrMeshMaterialRenderer } from './wgpuStandardPbrMeshMaterialRenderer';
import { wgpuToonMeshMaterialRenderer } from './wgpuToonMeshMaterialRenderer';
import { wgpuUnlitMeshMaterialRenderer } from './wgpuUnlitMeshMaterialRenderer';
import { wgpuVertexColorMeshMaterialRenderer } from './wgpuVertexColorMeshMaterialRenderer';
import { wgpuWireframeMeshMaterialRenderer } from './wgpuWireframeMeshMaterialRenderer';

function buildScene3DWgpuMeshMaterialRenderers(
  base: Readonly<ReadonlyMap<Kind, WgpuMeshMaterialRenderer | WgpuQuadMaterialRenderer>>,
): ReadonlyMap<Kind, WgpuMeshMaterialRenderer | WgpuQuadMaterialRenderer> {
  let table = base;
  table = withKindMapEntry(table, BlinnPhongMaterialKind, wgpuBlinnPhongMeshMaterialRenderer);
  table = withKindMapEntry(table, CustomShaderMaterialKind, wgpuCustomShaderMeshMaterialRenderer);
  table = withKindMapEntry(table, DepthMaterialKind, wgpuDepthMeshMaterialRenderer);
  table = withKindMapEntry(table, EmissiveMaterialKind, wgpuEmissiveMeshMaterialRenderer);
  table = withKindMapEntry(table, LambertMaterialKind, wgpuLambertMeshMaterialRenderer);
  table = withKindMapEntry(table, MatcapMaterialKind, wgpuMatcapMeshMaterialRenderer);
  table = withKindMapEntry(table, NormalMaterialKind, wgpuNormalMeshMaterialRenderer);
  table = withKindMapEntry(table, PhongMaterialKind, wgpuPhongMeshMaterialRenderer);
  table = withKindMapEntry(table, ShadedMaterialKind, wgpuShadedMeshMaterialRenderer);
  table = withKindMapEntry(table, SpecularGlossinessPbrMaterialKind, wgpuSpecularGlossinessPbrMeshMaterialRenderer);
  table = withKindMapEntry(table, StandardPbrMaterialKind, wgpuStandardPbrMeshMaterialRenderer);
  table = withKindMapEntry(table, ToonMaterialKind, wgpuToonMeshMaterialRenderer);
  table = withKindMapEntry(table, UnlitMaterialKind, wgpuUnlitMeshMaterialRenderer);
  table = withKindMapEntry(table, VertexColorMaterialKind, wgpuVertexColorMeshMaterialRenderer);
  table = withKindMapEntry(table, WireframeMaterialKind, wgpuWireframeMeshMaterialRenderer);
  return table;
}

function buildScene3DWgpuModifierSnippets(
  base: Readonly<ReadonlyMap<Kind, WgpuModifierSnippet>>,
): ReadonlyMap<Kind, WgpuModifierSnippet> {
  let table = base;
  table = withKindMapEntry(table, animatedNormalWgpuModifierSnippet.kind, animatedNormalWgpuModifierSnippet);
  table = withKindMapEntry(table, dissolveWgpuModifierSnippet.kind, dissolveWgpuModifierSnippet);
  table = withKindMapEntry(table, emissiveWgpuModifierSnippet.kind, emissiveWgpuModifierSnippet);
  table = withKindMapEntry(table, envReflectWgpuModifierSnippet.kind, envReflectWgpuModifierSnippet);
  table = withKindMapEntry(table, fogWgpuModifierSnippet.kind, fogWgpuModifierSnippet);
  table = withKindMapEntry(table, rimWgpuModifierSnippet.kind, rimWgpuModifierSnippet);
  table = withKindMapEntry(table, toonWgpuModifierSnippet.kind, toonWgpuModifierSnippet);
  table = withKindMapEntry(table, vertexDisplaceWgpuModifierSnippet.kind, vertexDisplaceWgpuModifierSnippet);
  return table;
}

function buildScene3DWgpuTextureResolvers(
  base: Readonly<ReadonlyMap<Kind, WgpuTextureResolver>>,
): ReadonlyMap<Kind, WgpuTextureResolver> {
  return concatKindMap(base, standardWgpuTextureResolvers);
}

// Node3D and ParticleEmitter3D are explicit renderWgpuScene3D passes rather than NodeRenderer entries.
// WGPU also has no ExtendedPbrMaterial renderer or PBR-extension registry: the seven scene3d-gl
// extensions stay GL-only until WGPU owns real registration and bind seams for them.
export const wgpuScene3DRenderRegistries: Readonly<WgpuRenderRegistries> = {
  ...wgpuScene2DRenderRegistries,
  gpuSkinning: wgpuSkinningAdapter,
  materialRenderers: buildScene3DWgpuMeshMaterialRenderers(wgpuScene2DRenderRegistries.materialRenderers),
  modifierSnippets: buildScene3DWgpuModifierSnippets(wgpuScene2DRenderRegistries.modifierSnippets),
  textureResolvers: buildScene3DWgpuTextureResolvers(wgpuScene2DRenderRegistries.textureResolvers),
};
