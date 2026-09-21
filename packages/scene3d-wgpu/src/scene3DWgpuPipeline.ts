import { concatRegistryTable, createSlotTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { standardWgpuTextureResolvers } from '@flighthq/render-wgpu/contract';
import { wgpuScene2DRenderRegistries } from '@flighthq/scene2d-wgpu/contract';
import type {
  KeyedTable,
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
  RegistryEntryState,
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
  base: Readonly<KeyedTable<WgpuMeshMaterialRenderer | WgpuQuadMaterialRenderer>>,
): KeyedTable<WgpuMeshMaterialRenderer | WgpuQuadMaterialRenderer> {
  let table = base;
  table = withRegistryTableEntry(table, BlinnPhongMaterialKind, wgpuBlinnPhongMeshMaterialRenderer);
  table = withRegistryTableEntry(table, CustomShaderMaterialKind, wgpuCustomShaderMeshMaterialRenderer);
  table = withRegistryTableEntry(table, DepthMaterialKind, wgpuDepthMeshMaterialRenderer);
  table = withRegistryTableEntry(table, EmissiveMaterialKind, wgpuEmissiveMeshMaterialRenderer);
  table = withRegistryTableEntry(table, LambertMaterialKind, wgpuLambertMeshMaterialRenderer);
  table = withRegistryTableEntry(table, MatcapMaterialKind, wgpuMatcapMeshMaterialRenderer);
  table = withRegistryTableEntry(table, NormalMaterialKind, wgpuNormalMeshMaterialRenderer);
  table = withRegistryTableEntry(table, PhongMaterialKind, wgpuPhongMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ShadedMaterialKind, wgpuShadedMeshMaterialRenderer);
  table = withRegistryTableEntry(
    table,
    SpecularGlossinessPbrMaterialKind,
    wgpuSpecularGlossinessPbrMeshMaterialRenderer,
  );
  table = withRegistryTableEntry(table, StandardPbrMaterialKind, wgpuStandardPbrMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ToonMaterialKind, wgpuToonMeshMaterialRenderer);
  table = withRegistryTableEntry(table, UnlitMaterialKind, wgpuUnlitMeshMaterialRenderer);
  table = withRegistryTableEntry(table, VertexColorMaterialKind, wgpuVertexColorMeshMaterialRenderer);
  table = withRegistryTableEntry(table, WireframeMaterialKind, wgpuWireframeMeshMaterialRenderer);
  return table;
}

function buildScene3DWgpuModifierSnippets(
  base: Readonly<KeyedTable<WgpuModifierSnippet>>,
): KeyedTable<WgpuModifierSnippet> {
  let table = base;
  table = withRegistryTableEntry(table, animatedNormalWgpuModifierSnippet.kind, animatedNormalWgpuModifierSnippet);
  table = withRegistryTableEntry(table, dissolveWgpuModifierSnippet.kind, dissolveWgpuModifierSnippet);
  table = withRegistryTableEntry(table, emissiveWgpuModifierSnippet.kind, emissiveWgpuModifierSnippet);
  table = withRegistryTableEntry(table, envReflectWgpuModifierSnippet.kind, envReflectWgpuModifierSnippet);
  table = withRegistryTableEntry(table, fogWgpuModifierSnippet.kind, fogWgpuModifierSnippet);
  table = withRegistryTableEntry(table, rimWgpuModifierSnippet.kind, rimWgpuModifierSnippet);
  table = withRegistryTableEntry(table, toonWgpuModifierSnippet.kind, toonWgpuModifierSnippet);
  table = withRegistryTableEntry(table, vertexDisplaceWgpuModifierSnippet.kind, vertexDisplaceWgpuModifierSnippet);
  return table;
}

function buildScene3DWgpuTextureResolvers(
  base: Readonly<KeyedTable<WgpuTextureResolver>>,
): KeyedTable<WgpuTextureResolver> {
  const table = concatRegistryTable(base, standardWgpuTextureResolvers);
  if (table.shape !== 'keyed') throw new Error('wgpuScene3DRenderRegistries: expected keyed texture resolver tables');
  return table;
}

// Node3D and ParticleEmitter3D are explicit renderWgpuScene3D passes rather than NodeRenderer entries.
// WGPU also has no ExtendedPbrMaterial renderer or PBR-extension registry: the seven scene3d-gl
// extensions stay GL-only until WGPU owns real registration and bind seams for them.
export const wgpuScene3DRenderRegistries: Readonly<WgpuRenderRegistries> = {
  ...wgpuScene2DRenderRegistries,
  gpuSkinning: {
    ...createSlotTable('WgpuGpuSkinning', 'Unregistered'),
    entry: { state: RegistryEntryState.Bound, value: wgpuSkinningAdapter },
  },
  materialRenderers: buildScene3DWgpuMeshMaterialRenderers(wgpuScene2DRenderRegistries.materialRenderers),
  modifierSnippets: buildScene3DWgpuModifierSnippets(wgpuScene2DRenderRegistries.modifierSnippets),
  textureResolvers: buildScene3DWgpuTextureResolvers(wgpuScene2DRenderRegistries.textureResolvers),
};
