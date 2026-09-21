import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { glScene2DRenderRegistries } from '@flighthq/scene2d-gl/contract';
import type {
  GlMeshMaterialRenderer,
  GlModifierSnippet,
  GlPbrExtensionRegistration,
  GlQuadMaterialRenderer,
  GlRenderRegistries,
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
import { clearcoatPbrGlExtension } from './clearcoatPbrGlExtension';
import { glBlinnPhongMeshMaterialRenderer } from './glBlinnPhongMeshMaterialRenderer';
import { glCustomShaderMeshMaterialRenderer } from './glCustomShaderMeshMaterialRenderer';
import { glDepthMeshMaterialRenderer } from './glDepthMeshMaterialRenderer';
import { glEmissiveMeshMaterialRenderer } from './glEmissiveMeshMaterialRenderer';
import { glExtendedPbrMeshMaterialRenderer } from './glExtendedPbrMeshMaterialRenderer';
import { glLambertMeshMaterialRenderer } from './glLambertMeshMaterialRenderer';
import { glMatcapMeshMaterialRenderer } from './glMatcapMeshMaterialRenderer';
import { glNormalMeshMaterialRenderer } from './glNormalMeshMaterialRenderer';
import { glPhongMeshMaterialRenderer } from './glPhongMeshMaterialRenderer';
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
import { glShadedMeshMaterialRenderer } from './glShadedMeshMaterialRenderer';
import { glSpecularGlossinessPbrMeshMaterialRenderer } from './glSpecularGlossinessPbrMeshMaterialRenderer';
import { glStandardPbrMeshMaterialRenderer } from './glStandardPbrMeshMaterialRenderer';
import { glToonMeshMaterialRenderer } from './glToonMeshMaterialRenderer';
import { glUnlitMeshMaterialRenderer } from './glUnlitMeshMaterialRenderer';
import { glVertexColorMeshMaterialRenderer } from './glVertexColorMeshMaterialRenderer';
import { glWireframeMeshMaterialRenderer } from './glWireframeMeshMaterialRenderer';
import { iridescencePbrGlExtension } from './iridescencePbrGlExtension';
import { sheenPbrGlExtension } from './sheenPbrGlExtension';
import { specularPbrGlExtension } from './specularPbrGlExtension';
import { transmissionVolumePbrGlExtension } from './transmissionVolumePbrGlExtension';
import { wrappedDiffusePbrGlExtension } from './wrappedDiffusePbrGlExtension';

function buildScene3DGlMeshMaterialRenderers(
  base: Readonly<KeyedTable<GlMeshMaterialRenderer | GlQuadMaterialRenderer>>,
): KeyedTable<GlMeshMaterialRenderer | GlQuadMaterialRenderer> {
  let table = base;
  table = withRegistryTableEntry(table, BlinnPhongMaterialKind, glBlinnPhongMeshMaterialRenderer);
  table = withRegistryTableEntry(table, CustomShaderMaterialKind, glCustomShaderMeshMaterialRenderer);
  table = withRegistryTableEntry(table, DepthMaterialKind, glDepthMeshMaterialRenderer);
  table = withRegistryTableEntry(table, EmissiveMaterialKind, glEmissiveMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ExtendedPbrMaterialKind, glExtendedPbrMeshMaterialRenderer);
  table = withRegistryTableEntry(table, LambertMaterialKind, glLambertMeshMaterialRenderer);
  table = withRegistryTableEntry(table, MatcapMaterialKind, glMatcapMeshMaterialRenderer);
  table = withRegistryTableEntry(table, NormalMaterialKind, glNormalMeshMaterialRenderer);
  table = withRegistryTableEntry(table, PhongMaterialKind, glPhongMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ShadedMaterialKind, glShadedMeshMaterialRenderer);
  table = withRegistryTableEntry(table, SpecularGlossinessPbrMaterialKind, glSpecularGlossinessPbrMeshMaterialRenderer);
  table = withRegistryTableEntry(table, StandardPbrMaterialKind, glStandardPbrMeshMaterialRenderer);
  table = withRegistryTableEntry(table, ToonMaterialKind, glToonMeshMaterialRenderer);
  table = withRegistryTableEntry(table, UnlitMaterialKind, glUnlitMeshMaterialRenderer);
  table = withRegistryTableEntry(table, VertexColorMaterialKind, glVertexColorMeshMaterialRenderer);
  return withRegistryTableEntry(table, WireframeMaterialKind, glWireframeMeshMaterialRenderer);
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

export const glScene3DRenderRegistries: Readonly<GlRenderRegistries> = {
  ...glScene2DRenderRegistries,
  materialRenderers: buildScene3DGlMeshMaterialRenderers(glScene2DRenderRegistries.materialRenderers),
  modifierSnippets: buildScene3DGlModifierSnippets(glScene2DRenderRegistries.modifierSnippets),
  pbrExtensions: buildScene3DGlPbrExtensions(glScene2DRenderRegistries.pbrExtensions),
};
