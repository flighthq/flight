import type { Kind, Material, WgpuMaterialRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { RenderRegistry, StandardMaterialKind } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export function getWgpuMaterialRenderer(state: WgpuRenderState, kind: Kind): WgpuMaterialRenderer | null {
  const runtime = getWgpuRenderStateRuntime(state);
  return runtime.materialRendererMap?.get(kind) ?? null;
}

export function registerWgpuMaterialRenderer(state: WgpuRenderState, kind: Kind, renderer: WgpuMaterialRenderer): void {
  const runtime = getWgpuRenderStateRuntime(state);
  (runtime.materialRendererMap ??= new Map()).set(kind, renderer);
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
  const map = runtime.materialRendererMap;
  const kind = material?.kind ?? StandardMaterialKind;
  const renderer = map?.get(kind) ?? null;
  if (renderer !== null) return renderer;

  // The requested kind is absent. StandardMaterialKind still stands in where it is registered, but the
  // miss is reported either way — substituting a different shading family is as much worth knowing as
  // drawing nothing, and the seam records one miss per kind, so neither case repeats.
  runtime.registryMiss?.(RenderRegistry.MaterialRenderer, kind);
  return kind === StandardMaterialKind ? null : (map?.get(StandardMaterialKind) ?? null);
}
