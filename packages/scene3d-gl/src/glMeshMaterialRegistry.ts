import type { GlMeshMaterialRenderer, GlRenderState, Kind, Material } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';

// Returns the 3D mesh-material renderer registered for a kind on this state, or null. The 3D scene
// analog of getGlMaterialRenderer; reads scene-gl's own per-state registry (sceneMeshMaterialRegistry),
// distinct from the 2D material-renderer table.
export function getGlMeshMaterialRenderer(state: GlRenderState, kind: Kind): GlMeshMaterialRenderer | null {
  return getGlScene3DRuntime(state).materialRegistry.get(kind) ?? null;
}

// Registers a 3D mesh-material renderer against a material kind on this state. Opt-in: drawScene3D
// only draws subsets whose material kind (or StandardMaterialKind) has a renderer here. Call
// registerGlStandardPbrMaterial for the built-in StandardPbr path. Mirrors registerGlMaterialRenderer
// but writes scene-gl's separate 3D registry.
export function registerGlMeshMaterialRenderer(
  state: GlRenderState,
  kind: Kind,
  renderer: GlMeshMaterialRenderer,
): void {
  getGlScene3DRuntime(state).materialRegistry.set(kind, renderer);
}

// Resolves a mesh subset's material to its registered 3D renderer: by the material's kind, else the
// renderer registered for StandardMaterialKind, else null. drawScene3D skips a subset whose material
// resolves to null (no built-in fallback — every material, including the default, enters only
// through registration). Mirrors resolveGlMaterialRenderer over the 3D registry.
export function resolveGlMeshMaterialRenderer(
  state: GlRenderState,
  material: Readonly<Material> | null,
): GlMeshMaterialRenderer | null {
  const registry = getGlScene3DRuntime(state).materialRegistry;
  if (material !== null) {
    const renderer = registry.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return registry.get(StandardMaterialKind) ?? null;
}
