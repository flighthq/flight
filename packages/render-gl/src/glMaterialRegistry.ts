import { withRegistryTableEntry } from '@flighthq/registry/contract';
import type { GlMaterialRenderer, GlRenderState, Kind, Material } from '@flighthq/types/contract';
import { RegistryEntryState, RenderRegistry, StandardMaterialKind } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

export function getGlMaterialRenderer(state: GlRenderState, kind: Kind): GlMaterialRenderer | null {
  const entry = getGlRenderStateRuntime(state).registries.materialRenderers.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

export function registerGlMaterialRenderer(state: GlRenderState, kind: Kind, renderer: GlMaterialRenderer): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.registries.materialRenderers = withRegistryTableEntry(runtime.registries.materialRenderers, kind, renderer);
}

// Resolves a node's material to its registered renderer: by the material's kind, else the renderer
// registered for StandardMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveGlMaterialRenderer(state: GlRenderState, material: Material | null): GlMaterialRenderer | null {
  const runtime = getGlRenderStateRuntime(state);
  const entries = runtime.registries.materialRenderers.entries;
  const kind = material?.kind ?? StandardMaterialKind;
  const entry = entries.get(kind);
  if (entry?.state === RegistryEntryState.Bound) return entry.value;

  // The requested kind is absent. StandardMaterialKind still stands in where it is registered, but the
  // miss is reported either way — substituting a different shading family is as much worth knowing as
  // drawing nothing, and the seam records one miss per kind, so neither case repeats.
  runtime.registryMiss?.(RenderRegistry.MaterialRenderer, kind);
  if (kind === StandardMaterialKind) return null;
  const fallback = entries.get(StandardMaterialKind);
  return fallback?.state === RegistryEntryState.Bound ? fallback.value : null;
}
