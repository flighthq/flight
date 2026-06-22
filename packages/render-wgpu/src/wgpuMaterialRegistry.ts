import type { Kind, Material, WgpuMaterialRenderer, WgpuRenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

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
// registered for DefaultMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveWgpuMaterialRenderer(
  state: WgpuRenderState,
  material: Material | null,
): WgpuMaterialRenderer | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const map = runtime.materialRendererMap;
  if (map === undefined) return null;
  if (material !== null) {
    const renderer = map.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return map.get(DefaultMaterialKind) ?? null;
}
