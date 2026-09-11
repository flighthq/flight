import { concatRegistryTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import {
  createWgpuPipeline,
  getWgpuPipelineRegistries,
  standardWgpuTextureResolvers,
} from '@flighthq/render-wgpu/contract';
import { scene2DWgpuPipeline } from '@flighthq/scene2d-wgpu/contract';
import type {
  KeyedTable,
  WgpuMeshMaterialRenderer,
  WgpuModifierSnippet,
  WgpuPipeline,
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

import { blinnPhongWgpuMeshMaterialRenderer } from './blinnPhongWgpuMeshMaterialRenderer';
import { customShaderWgpuMeshMaterialRenderer } from './customShaderWgpuMeshMaterialRenderer';
import { depthWgpuMeshMaterialRenderer } from './depthWgpuMeshMaterialRenderer';
import { emissiveWgpuMeshMaterialRenderer } from './emissiveWgpuMeshMaterialRenderer';
import { lambertWgpuMeshMaterialRenderer } from './lambertWgpuMeshMaterialRenderer';
import { matcapWgpuMeshMaterialRenderer } from './matcapWgpuMeshMaterialRenderer';
import { normalWgpuMeshMaterialRenderer } from './normalWgpuMeshMaterialRenderer';
import { phongWgpuMeshMaterialRenderer } from './phongWgpuMeshMaterialRenderer';
import { shadedWgpuMeshMaterialRenderer } from './shadedWgpuMeshMaterialRenderer';
import { specularGlossinessPbrWgpuMeshMaterialRenderer } from './specularGlossinessPbrWgpuMeshMaterialRenderer';
import { standardPbrWgpuMeshMaterialRenderer } from './standardPbrWgpuMeshMaterialRenderer';
import { toonWgpuMeshMaterialRenderer } from './toonWgpuMeshMaterialRenderer';
import { unlitWgpuMeshMaterialRenderer } from './unlitWgpuMeshMaterialRenderer';
import { vertexColorWgpuMeshMaterialRenderer } from './vertexColorWgpuMeshMaterialRenderer';
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
import { defaultWgpuSkinningAdapter } from './wgpuSkinPalette';
import { wireframeWgpuMeshMaterialRenderer } from './wireframeWgpuMeshMaterialRenderer';

function buildScene3DWgpuMeshMaterialRenderers(
  base: Readonly<KeyedTable<WgpuMeshMaterialRenderer>>,
): KeyedTable<WgpuMeshMaterialRenderer> {
  let table = base;
  table = withRegistryTableEntry(table, BlinnPhongMaterialKind, blinnPhongWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, CustomShaderMaterialKind, customShaderWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, DepthMaterialKind, depthWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, EmissiveMaterialKind, emissiveWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, LambertMaterialKind, lambertWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, MatcapMaterialKind, matcapWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, NormalMaterialKind, normalWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, PhongMaterialKind, phongWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ShadedMaterialKind, shadedWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(
    table,
    SpecularGlossinessPbrMaterialKind,
    specularGlossinessPbrWgpuMeshMaterialRenderer,
  );
  table = withRegistryTableEntry(table, StandardPbrMaterialKind, standardPbrWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ToonMaterialKind, toonWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, UnlitMaterialKind, unlitWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, VertexColorMaterialKind, vertexColorWgpuMeshMaterialRenderer);
  table = withRegistryTableEntry(table, WireframeMaterialKind, wireframeWgpuMeshMaterialRenderer);
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
  if (table.shape !== 'keyed') throw new Error('scene3DWgpuPipeline: expected keyed texture resolver tables');
  return table;
}

const _registries = getWgpuPipelineRegistries(scene2DWgpuPipeline);

// Node3D and ParticleEmitter3D are explicit drawWgpuScene3D passes rather than NodeRenderer entries.
// WGPU also has no ExtendedPbrMaterial renderer or PBR-extension registry: the seven scene3d-gl
// extensions stay GL-only until WGPU owns real registration and bind seams for them.
export const scene3DWgpuPipeline: WgpuPipeline = createWgpuPipeline({
  ..._registries,
  gpuSkinning: {
    ..._registries.gpuSkinning,
    entry: { state: RegistryEntryState.Bound, value: defaultWgpuSkinningAdapter },
  },
  meshMaterialRenderers: buildScene3DWgpuMeshMaterialRenderers(_registries.meshMaterialRenderers),
  modifierSnippets: buildScene3DWgpuModifierSnippets(_registries.modifierSnippets),
  textureResolvers: buildScene3DWgpuTextureResolvers(_registries.textureResolvers),
});
