import type { GlMaterialRenderer, GlRenderState, Kind, Material } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';

export function getGlMaterialRenderer(state: GlRenderState, kind: Kind): GlMaterialRenderer | null {
  return getGlRenderStateRuntime(state).materialRendererMap?.get(kind) ?? null;
}

export function registerGlMaterialRenderer(state: GlRenderState, kind: Kind, renderer: GlMaterialRenderer): void {
  const runtime = getGlRenderStateRuntime(state);
  (runtime.materialRendererMap ??= new Map()).set(kind, renderer);
}

// Resolves a node's material to its registered renderer: by the material's kind, else the renderer
// registered for DefaultMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveGlMaterialRenderer(state: GlRenderState, material: Material | null): GlMaterialRenderer | null {
  const map = getGlRenderStateRuntime(state).materialRendererMap;
  if (map === undefined) return null;
  if (material !== null) {
    const renderer = map.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return map.get(DefaultMaterialKind) ?? null;
}
