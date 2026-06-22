import type { GlMeshMaterialRenderer, GlRenderState, Material } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// Returns the 3D mesh-material renderer registered for a kind on this state, or null. The 3D scene
// analog of getGlMaterialRenderer; reads scene-gl's own per-state registry (sceneMeshMaterialRegistry),
// distinct from the 2D materialRendererMap.
export function getGlMeshMaterialRenderer(state: GlRenderState, kind: symbol): GlMeshMaterialRenderer | null {
  return getGlSceneRuntime(state).materialRegistry.get(kind) ?? null;
}

// Registers a 3D mesh-material renderer against a material kind on this state. Opt-in: drawScene
// only draws subsets whose material kind (or DefaultMaterialKind) has a renderer here. Call
// registerStandardPbrGlMaterial for the built-in StandardPbr path. Mirrors registerGlMaterialRenderer
// but writes scene-gl's separate 3D registry.
export function registerGlMeshMaterialRenderer(
  state: GlRenderState,
  kind: symbol,
  renderer: GlMeshMaterialRenderer,
): void {
  getGlSceneRuntime(state).materialRegistry.set(kind, renderer);
}

// Resolves a mesh subset's material to its registered 3D renderer: by the material's kind, else the
// renderer registered for DefaultMaterialKind, else null. drawScene skips a subset whose material
// resolves to null (no built-in fallback — every material, including the default, enters only
// through registration). Mirrors resolveGlMaterialRenderer over the 3D registry.
export function resolveGlMeshMaterialRenderer(
  state: GlRenderState,
  material: Readonly<Material> | null,
): GlMeshMaterialRenderer | null {
  const registry = getGlSceneRuntime(state).materialRegistry;
  if (material !== null) {
    const renderer = registry.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return registry.get(DefaultMaterialKind) ?? null;
}
