import { concatKindMap, withKindMapEntry } from '@flighthq/registry/contract';
import { standardWgpuTextureResolvers } from '@flighthq/render-wgpu/contract';
import { wgpuScene2DRenderPreset } from '@flighthq/scene2d-wgpu/contract';
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

import { wgpuBlinnPhongMeshMaterialRenderer } from './wgpuBlinnPhongMeshMaterialRenderer.ts';
import { wgpuCustomShaderMeshMaterialRenderer } from './wgpuCustomShaderMeshMaterialRenderer.ts';
import { wgpuDepthMeshMaterialRenderer } from './wgpuDepthMeshMaterialRenderer.ts';
import { wgpuEmissiveMeshMaterialRenderer } from './wgpuEmissiveMeshMaterialRenderer.ts';
import { wgpuLambertMeshMaterialRenderer } from './wgpuLambertMeshMaterialRenderer.ts';
import { wgpuMatcapMeshMaterialRenderer } from './wgpuMatcapMeshMaterialRenderer.ts';
import { wgpuNormalMeshMaterialRenderer } from './wgpuNormalMeshMaterialRenderer.ts';
import { wgpuPhongMeshMaterialRenderer } from './wgpuPhongMeshMaterialRenderer.ts';
import { wgpuShadedMeshMaterialRenderer } from './wgpuShadedMeshMaterialRenderer.ts';
import {
  animatedNormalWgpuModifierSnippet,
  dissolveWgpuModifierSnippet,
  emissiveWgpuModifierSnippet,
  envReflectWgpuModifierSnippet,
  fogWgpuModifierSnippet,
  rimWgpuModifierSnippet,
  toonWgpuModifierSnippet,
  vertexDisplaceWgpuModifierSnippet,
} from './wgpuShadedPrelude.ts';
import { wgpuSkinningAdapter } from './wgpuSkinPalette.ts';
import { wgpuSpecularGlossinessPbrMeshMaterialRenderer } from './wgpuSpecularGlossinessPbrMeshMaterialRenderer.ts';
import { wgpuStandardPbrMeshMaterialRenderer } from './wgpuStandardPbrMeshMaterialRenderer.ts';
import { wgpuToonMeshMaterialRenderer } from './wgpuToonMeshMaterialRenderer.ts';
import { wgpuUnlitMeshMaterialRenderer } from './wgpuUnlitMeshMaterialRenderer.ts';
import { wgpuVertexColorMeshMaterialRenderer } from './wgpuVertexColorMeshMaterialRenderer.ts';
import { wgpuWireframeMeshMaterialRenderer } from './wgpuWireframeMeshMaterialRenderer.ts';

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
export const wgpuScene3DRenderPreset: Readonly<WgpuRenderRegistries> = Object.freeze({
  ...wgpuScene2DRenderPreset,
  gpuSkinning: wgpuSkinningAdapter,
  materialRenderers: buildScene3DWgpuMeshMaterialRenderers(wgpuScene2DRenderPreset.materialRenderers),
  modifierSnippets: buildScene3DWgpuModifierSnippets(wgpuScene2DRenderPreset.modifierSnippets),
  textureResolvers: buildScene3DWgpuTextureResolvers(wgpuScene2DRenderPreset.textureResolvers),
});
