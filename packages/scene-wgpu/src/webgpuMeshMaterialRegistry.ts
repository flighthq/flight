import type { Material, WgpuMeshMaterialRenderer, WgpuRenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { getWgpuSceneRuntime } from './webgpuSceneRuntime';

// Returns the 3D mesh-material renderer registered for a kind on this state, or null. The 3D scene
// analog of getWgpuMaterialRenderer; reads scene-wgpu's own per-state registry
// (sceneMeshMaterialRegistry), distinct from the 2D materialRendererMap.
export function getWgpuMeshMaterialRenderer(state: WgpuRenderState, kind: symbol): WgpuMeshMaterialRenderer | null {
  return getWgpuSceneRuntime(state).materialRegistry.get(kind) ?? null;
}

// Registers a 3D mesh-material renderer against a material kind on this state. Opt-in: drawScene only
// draws subsets whose material kind (or DefaultMaterialKind) has a renderer here. Call
// registerStandardPbrWgpuMaterial for the built-in StandardPbr path. Mirrors registerWgpuMaterialRenderer
// but writes scene-wgpu's separate 3D registry.
export function registerWgpuMeshMaterialRenderer(
  state: WgpuRenderState,
  kind: symbol,
  renderer: WgpuMeshMaterialRenderer,
): void {
  getWgpuSceneRuntime(state).materialRegistry.set(kind, renderer);
}

// Resolves a mesh subset's material to its registered 3D renderer: by the material's kind, else the
// renderer registered for DefaultMaterialKind, else null. drawScene skips a subset whose material
// resolves to null (no built-in fallback — every material, including the default, enters only through
// registration). Mirrors resolveWgpuMaterialRenderer over the 3D registry.
export function resolveWgpuMeshMaterialRenderer(
  state: WgpuRenderState,
  material: Readonly<Material> | null,
): WgpuMeshMaterialRenderer | null {
  const registry = getWgpuSceneRuntime(state).materialRegistry;
  if (material !== null) {
    const renderer = registry.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return registry.get(DefaultMaterialKind) ?? null;
}
