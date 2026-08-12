import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlMeshMaterialRenderer, GlRenderState, Kind, Material } from '@flighthq/types/contract';
import { RegistryEntryState, StandardMaterialKind } from '@flighthq/types/contract';

// Returns the 3D mesh-material renderer registered for a kind on this state, or null. The 3D scene
// analog of getGlMaterialRenderer; reads scene-gl's own per-state persistent registry table,
// distinct from the 2D material-renderer table.
export function getGlMeshMaterialRenderer(state: GlRenderState, kind: Kind): GlMeshMaterialRenderer | null {
  const entry = getGlRenderStateRuntime(state).registries.meshMaterialRenderers.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
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
  const runtime = getGlRenderStateRuntime(state);
  runtime.registries.meshMaterialRenderers = withRegistryTableEntry(
    runtime.registries.meshMaterialRenderers,
    kind,
    renderer,
  );
}

// Resolves a mesh subset's material to its registered 3D renderer: by the material's kind, else the
// renderer registered for StandardMaterialKind, else null. drawScene3D skips a subset whose material
// resolves to null (no built-in fallback — every material, including the default, enters only
// through registration). Mirrors resolveGlMaterialRenderer over the 3D registry.
export function resolveGlMeshMaterialRenderer(
  state: GlRenderState,
  material: Readonly<Material> | null,
): GlMeshMaterialRenderer | null {
  const entries = getGlRenderStateRuntime(state).registries.meshMaterialRenderers.entries;
  if (material !== null) {
    const entry = entries.get(material.kind);
    if (entry?.state === RegistryEntryState.Bound) return entry.value;
  }
  const fallback = entries.get(StandardMaterialKind);
  return fallback?.state === RegistryEntryState.Bound ? fallback.value : null;
}
