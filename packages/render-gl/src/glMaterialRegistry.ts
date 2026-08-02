import type { GlMaterialRenderer, GlRenderState, Kind, Material } from '@flighthq/types/contract';
import { RenderRegistry, StandardMaterialKind } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

export function getGlMaterialRenderer(state: GlRenderState, kind: Kind): GlMaterialRenderer | null {
  return getGlRenderStateRuntime(state).materialRendererMap?.get(kind) ?? null;
}

export function registerGlMaterialRenderer(state: GlRenderState, kind: Kind, renderer: GlMaterialRenderer): void {
  const runtime = getGlRenderStateRuntime(state);
  (runtime.materialRendererMap ??= new Map()).set(kind, renderer);
}

// Resolves a node's material to its registered renderer: by the material's kind, else the renderer
// registered for StandardMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveGlMaterialRenderer(state: GlRenderState, material: Material | null): GlMaterialRenderer | null {
  const runtime = getGlRenderStateRuntime(state);
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
