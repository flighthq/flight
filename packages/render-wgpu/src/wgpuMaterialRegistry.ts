import { withRegistryTableEntry } from '@flighthq/registry/contract';
import type { Kind, Material, WgpuMaterialRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { RegistryEntryState, RenderRegistry, StandardMaterialKind } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export function getWgpuMaterialRenderer(state: WgpuRenderState, kind: Kind): WgpuMaterialRenderer | null {
  const entry = getWgpuRenderStateRuntime(state).registries.materialRenderers.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

export function registerWgpuMaterialRenderer(state: WgpuRenderState, kind: Kind, renderer: WgpuMaterialRenderer): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.registries.materialRenderers = withRegistryTableEntry(runtime.registries.materialRenderers, kind, renderer);
}

// Resolves a node's material to its registered renderer: by the material's kind, else the renderer
// registered for StandardMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveWgpuMaterialRenderer(
  state: WgpuRenderState,
  material: Material | null,
): WgpuMaterialRenderer | null {
  const runtime = getWgpuRenderStateRuntime(state);
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
