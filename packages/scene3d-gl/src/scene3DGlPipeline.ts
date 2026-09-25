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

import { anisotropyPbrGlExtension } from './anisotropyPbrGlExtension.ts';
import { clearcoatPbrGlExtension } from './clearcoatPbrGlExtension.ts';
import { glBlinnPhongMeshMaterialRenderer } from './glBlinnPhongMeshMaterialRenderer.ts';
import { glCustomShaderMeshMaterialRenderer } from './glCustomShaderMeshMaterialRenderer.ts';
import { glDepthMeshMaterialRenderer } from './glDepthMeshMaterialRenderer.ts';
import { glEmissiveMeshMaterialRenderer } from './glEmissiveMeshMaterialRenderer.ts';
import { glExtendedPbrMeshMaterialRenderer } from './glExtendedPbrMeshMaterialRenderer.ts';
import { glLambertMeshMaterialRenderer } from './glLambertMeshMaterialRenderer.ts';
import { glMatcapMeshMaterialRenderer } from './glMatcapMeshMaterialRenderer.ts';
import { glNormalMeshMaterialRenderer } from './glNormalMeshMaterialRenderer.ts';
import { glPhongMeshMaterialRenderer } from './glPhongMeshMaterialRenderer.ts';
import {
  animatedNormalGlModifierSnippet,
  dissolveGlModifierSnippet,
  emissiveGlModifierSnippet,
  envReflectGlModifierSnippet,
  fogGlModifierSnippet,
  rimGlModifierSnippet,
  toonGlModifierSnippet,
  vertexDisplaceGlModifierSnippet,
} from './glShadedBuiltInModifiers.ts';
import { glShadedMeshMaterialRenderer } from './glShadedMeshMaterialRenderer.ts';
import { glSpecularGlossinessPbrMeshMaterialRenderer } from './glSpecularGlossinessPbrMeshMaterialRenderer.ts';
import { glStandardPbrMeshMaterialRenderer } from './glStandardPbrMeshMaterialRenderer.ts';
import { glToonMeshMaterialRenderer } from './glToonMeshMaterialRenderer.ts';
import { glUnlitMeshMaterialRenderer } from './glUnlitMeshMaterialRenderer.ts';
import { glVertexColorMeshMaterialRenderer } from './glVertexColorMeshMaterialRenderer.ts';
import { glWireframeMeshMaterialRenderer } from './glWireframeMeshMaterialRenderer.ts';
import { iridescencePbrGlExtension } from './iridescencePbrGlExtension.ts';
import { sheenPbrGlExtension } from './sheenPbrGlExtension.ts';
import { specularPbrGlExtension } from './specularPbrGlExtension.ts';
import { transmissionVolumePbrGlExtension } from './transmissionVolumePbrGlExtension.ts';
import { wrappedDiffusePbrGlExtension } from './wrappedDiffusePbrGlExtension.ts';

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
