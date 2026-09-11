import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { createGlPipeline, getGlPipelineRegistries } from '@flighthq/render-gl/contract';
import { scene2DGlPipeline } from '@flighthq/scene2d-gl/contract';
import type {
  GlMeshMaterialRenderer,
  GlModifierSnippet,
  GlPbrExtensionRegistration,
  GlPipeline,
  KeyedTable,
} from '@flighthq/types/contract';
import {
  AnimatedNormalModifierKind,
  AnisotropyPbrExtensionKind,
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
  IridescencePbrExtensionKind,
  LambertMaterialKind,
  MatcapMaterialKind,
  NormalMaterialKind,
  PhongMaterialKind,
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

import { anisotropyPbrGlExtension } from './anisotropyPbrGlExtension';
import { blinnPhongGlMeshMaterialRenderer } from './blinnPhongGlMeshMaterialRenderer';
import { clearcoatPbrGlExtension } from './clearcoatPbrGlExtension';
import { customShaderGlMeshMaterialRenderer } from './customShaderGlMeshMaterialRenderer';
import { depthGlMeshMaterialRenderer } from './depthGlMeshMaterialRenderer';
import { emissiveGlMeshMaterialRenderer } from './emissiveGlMeshMaterialRenderer';
import { extendedPbrGlMeshMaterialRenderer } from './extendedPbrGlMeshMaterialRenderer';
import {
  animatedNormalGlModifierSnippet,
  dissolveGlModifierSnippet,
  emissiveGlModifierSnippet,
  envReflectGlModifierSnippet,
  fogGlModifierSnippet,
  rimGlModifierSnippet,
  toonGlModifierSnippet,
  vertexDisplaceGlModifierSnippet,
} from './glShadedBuiltInModifiers';
import { iridescencePbrGlExtension } from './iridescencePbrGlExtension';
import { lambertGlMeshMaterialRenderer } from './lambertGlMeshMaterialRenderer';
import { matcapGlMeshMaterialRenderer } from './matcapGlMeshMaterialRenderer';
import { normalGlMeshMaterialRenderer } from './normalGlMeshMaterialRenderer';
import { phongGlMeshMaterialRenderer } from './phongGlMeshMaterialRenderer';
import { shadedGlMeshMaterialRenderer } from './shadedGlMeshMaterialRenderer';
import { sheenPbrGlExtension } from './sheenPbrGlExtension';
import { specularGlossinessPbrGlMeshMaterialRenderer } from './specularGlossinessPbrGlMeshMaterialRenderer';
import { specularPbrGlExtension } from './specularPbrGlExtension';
import { standardPbrGlMeshMaterialRenderer } from './standardPbrGlMeshMaterialRenderer';
import { toonGlMeshMaterialRenderer } from './toonGlMeshMaterialRenderer';
import { transmissionVolumePbrGlExtension } from './transmissionVolumePbrGlExtension';
import { unlitGlMeshMaterialRenderer } from './unlitGlMeshMaterialRenderer';
import { vertexColorGlMeshMaterialRenderer } from './vertexColorGlMeshMaterialRenderer';
import { wireframeGlMeshMaterialRenderer } from './wireframeGlMeshMaterialRenderer';
import { wrappedDiffusePbrGlExtension } from './wrappedDiffusePbrGlExtension';

function buildScene3DGlMeshMaterialRenderers(
  base: Readonly<KeyedTable<GlMeshMaterialRenderer>>,
): KeyedTable<GlMeshMaterialRenderer> {
  let table = base;
  table = withRegistryTableEntry(table, BlinnPhongMaterialKind, blinnPhongGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, CustomShaderMaterialKind, customShaderGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, DepthMaterialKind, depthGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, EmissiveMaterialKind, emissiveGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ExtendedPbrMaterialKind, extendedPbrGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, LambertMaterialKind, lambertGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, MatcapMaterialKind, matcapGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, NormalMaterialKind, normalGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, PhongMaterialKind, phongGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ShadedMaterialKind, shadedGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, SpecularGlossinessPbrMaterialKind, specularGlossinessPbrGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, StandardPbrMaterialKind, standardPbrGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ToonMaterialKind, toonGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, UnlitMaterialKind, unlitGlMeshMaterialRenderer);
  table = withRegistryTableEntry(table, VertexColorMaterialKind, vertexColorGlMeshMaterialRenderer);
  return withRegistryTableEntry(table, WireframeMaterialKind, wireframeGlMeshMaterialRenderer);
}

function buildScene3DGlModifierSnippets(base: Readonly<KeyedTable<GlModifierSnippet>>): KeyedTable<GlModifierSnippet> {
  let table = base;
  table = withRegistryTableEntry(table, AnimatedNormalModifierKind, animatedNormalGlModifierSnippet);
  table = withRegistryTableEntry(table, DissolveModifierKind, dissolveGlModifierSnippet);
  table = withRegistryTableEntry(table, EmissiveModifierKind, emissiveGlModifierSnippet);
  table = withRegistryTableEntry(table, EnvReflectModifierKind, envReflectGlModifierSnippet);
  table = withRegistryTableEntry(table, FogModifierKind, fogGlModifierSnippet);
  table = withRegistryTableEntry(table, RimModifierKind, rimGlModifierSnippet);
  table = withRegistryTableEntry(table, ToonModifierKind, toonGlModifierSnippet);
  return withRegistryTableEntry(table, VertexDisplaceModifierKind, vertexDisplaceGlModifierSnippet);
}

function buildScene3DGlPbrExtensions(
  base: Readonly<KeyedTable<GlPbrExtensionRegistration>>,
): KeyedTable<GlPbrExtensionRegistration> {
  let table = base;
  table = withRegistryTableEntry(table, AnisotropyPbrExtensionKind, anisotropyPbrGlExtension);
  table = withRegistryTableEntry(table, ClearcoatPbrExtensionKind, clearcoatPbrGlExtension);
  table = withRegistryTableEntry(table, IridescencePbrExtensionKind, iridescencePbrGlExtension);
  table = withRegistryTableEntry(table, SheenPbrExtensionKind, sheenPbrGlExtension);
  table = withRegistryTableEntry(table, SpecularPbrExtensionKind, specularPbrGlExtension);
  table = withRegistryTableEntry(table, TransmissionVolumePbrExtensionKind, transmissionVolumePbrGlExtension);
  return withRegistryTableEntry(table, WrappedDiffusePbrExtensionKind, wrappedDiffusePbrGlExtension);
}

const scene2DGlRegistries = getGlPipelineRegistries(scene2DGlPipeline);

export const scene3DGlPipeline: GlPipeline = createGlPipeline({
  ...scene2DGlRegistries,
  meshMaterialRenderers: buildScene3DGlMeshMaterialRenderers(scene2DGlRegistries.meshMaterialRenderers),
  modifierSnippets: buildScene3DGlModifierSnippets(scene2DGlRegistries.modifierSnippets),
  pbrExtensions: buildScene3DGlPbrExtensions(scene2DGlRegistries.pbrExtensions),
});
