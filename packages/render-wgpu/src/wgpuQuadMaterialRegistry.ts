import { withKindMapEntry } from '@flighthq/registry/contract';
import type { Kind, Material, WgpuQuadMaterialRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { RenderRegistryTable, StandardMaterialKind } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export function getWgpuQuadMaterialRenderer(state: WgpuRenderState, kind: Kind): WgpuQuadMaterialRenderer | null {
  const entry = getWgpuRenderStateRuntime(state).registries.materialRenderers.get(kind);
  return (entry as WgpuQuadMaterialRenderer | undefined) ?? null;
}

export function registerWgpuQuadMaterialRenderer(
  state: WgpuRenderState,
  kind: Kind,
  renderer: WgpuQuadMaterialRenderer,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.registries.materialRenderers = withKindMapEntry(runtime.registries.materialRenderers, kind, renderer);
}

// Resolves a node's material to its registered renderer: by the material's kind, else the renderer
// registered for StandardMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveWgpuQuadMaterialRenderer(
  state: WgpuRenderState,
  material: Material | null,
): WgpuQuadMaterialRenderer | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const table = runtime.registries.materialRenderers;
  const kind = material?.kind ?? StandardMaterialKind;
  const entry = table.get(kind);
  if (entry != null) return entry as WgpuQuadMaterialRenderer;

  // The requested kind is absent. StandardMaterialKind still stands in where it is registered, but the
  // miss is reported either way — substituting a different shading family is as much worth knowing as
  // drawing nothing, and the seam records one miss per kind, so neither case repeats.
  runtime.registryMiss?.(RenderRegistryTable.MaterialRenderer, kind);
  if (kind === StandardMaterialKind) return null;
  const fallback = table.get(StandardMaterialKind);
  return (fallback as WgpuQuadMaterialRenderer | undefined) ?? null;
}
