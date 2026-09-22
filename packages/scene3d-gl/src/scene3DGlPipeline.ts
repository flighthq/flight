import { withKindMapEntry } from '@flighthq/registry/contract';
import { glScene2DRenderPreset } from '@flighthq/scene2d-gl/contract';
import type {
  GlMeshMaterialRenderer,
  GlModifierSnippet,
  GlPbrExtensionRegistration,
  GlQuadMaterialRenderer,
  GlRenderRegistries,
  Kind,
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
  base: Readonly<ReadonlyMap<Kind, GlMeshMaterialRenderer | GlQuadMaterialRenderer>>,
): ReadonlyMap<Kind, GlMeshMaterialRenderer | GlQuadMaterialRenderer> {
  let table = base;
  table = withKindMapEntry(table, BlinnPhongMaterialKind, glBlinnPhongMeshMaterialRenderer);
  table = withKindMapEntry(table, CustomShaderMaterialKind, glCustomShaderMeshMaterialRenderer);
  table = withKindMapEntry(table, DepthMaterialKind, glDepthMeshMaterialRenderer);
  table = withKindMapEntry(table, EmissiveMaterialKind, glEmissiveMeshMaterialRenderer);
  table = withKindMapEntry(table, ExtendedPbrMaterialKind, glExtendedPbrMeshMaterialRenderer);
  table = withKindMapEntry(table, LambertMaterialKind, glLambertMeshMaterialRenderer);
  table = withKindMapEntry(table, MatcapMaterialKind, glMatcapMeshMaterialRenderer);
  table = withKindMapEntry(table, NormalMaterialKind, glNormalMeshMaterialRenderer);
  table = withKindMapEntry(table, PhongMaterialKind, glPhongMeshMaterialRenderer);
  table = withKindMapEntry(table, ShadedMaterialKind, glShadedMeshMaterialRenderer);
  table = withKindMapEntry(table, SpecularGlossinessPbrMaterialKind, glSpecularGlossinessPbrMeshMaterialRenderer);
  table = withKindMapEntry(table, StandardPbrMaterialKind, glStandardPbrMeshMaterialRenderer);
  table = withKindMapEntry(table, ToonMaterialKind, glToonMeshMaterialRenderer);
  table = withKindMapEntry(table, UnlitMaterialKind, glUnlitMeshMaterialRenderer);
  table = withKindMapEntry(table, VertexColorMaterialKind, glVertexColorMeshMaterialRenderer);
  return withKindMapEntry(table, WireframeMaterialKind, glWireframeMeshMaterialRenderer);
}

function buildScene3DGlModifierSnippets(
  base: Readonly<ReadonlyMap<Kind, GlModifierSnippet>>,
): ReadonlyMap<Kind, GlModifierSnippet> {
  let table = base;
  table = withKindMapEntry(table, AnimatedNormalModifierKind, animatedNormalGlModifierSnippet);
  table = withKindMapEntry(table, DissolveModifierKind, dissolveGlModifierSnippet);
  table = withKindMapEntry(table, EmissiveModifierKind, emissiveGlModifierSnippet);
  table = withKindMapEntry(table, EnvReflectModifierKind, envReflectGlModifierSnippet);
  table = withKindMapEntry(table, FogModifierKind, fogGlModifierSnippet);
  table = withKindMapEntry(table, RimModifierKind, rimGlModifierSnippet);
  table = withKindMapEntry(table, ToonModifierKind, toonGlModifierSnippet);
  return withKindMapEntry(table, VertexDisplaceModifierKind, vertexDisplaceGlModifierSnippet);
}

function buildScene3DGlPbrExtensions(
  base: Readonly<ReadonlyMap<Kind, GlPbrExtensionRegistration>>,
): ReadonlyMap<Kind, GlPbrExtensionRegistration> {
  let table = base;
  table = withKindMapEntry(table, AnisotropyPbrExtensionKind, anisotropyPbrGlExtension);
  table = withKindMapEntry(table, ClearcoatPbrExtensionKind, clearcoatPbrGlExtension);
  table = withKindMapEntry(table, IridescencePbrExtensionKind, iridescencePbrGlExtension);
  table = withKindMapEntry(table, SheenPbrExtensionKind, sheenPbrGlExtension);
  table = withKindMapEntry(table, SpecularPbrExtensionKind, specularPbrGlExtension);
  table = withKindMapEntry(table, TransmissionVolumePbrExtensionKind, transmissionVolumePbrGlExtension);
  return withKindMapEntry(table, WrappedDiffusePbrExtensionKind, wrappedDiffusePbrGlExtension);
}

export const glScene3DRenderPreset: Readonly<GlRenderRegistries> = Object.freeze({
  ...glScene2DRenderPreset,
  materialRenderers: buildScene3DGlMeshMaterialRenderers(glScene2DRenderPreset.materialRenderers),
  modifierSnippets: buildScene3DGlModifierSnippets(glScene2DRenderPreset.modifierSnippets),
  pbrExtensions: buildScene3DGlPbrExtensions(glScene2DRenderPreset.pbrExtensions),
});
