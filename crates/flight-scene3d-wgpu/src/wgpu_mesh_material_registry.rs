// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the resolver reads any material through `&dyn Material`, as the 2D quad registry does
//! The 3D mesh-material renderer table (TS `wgpuMeshMaterialRegistry.ts`): the scene analog of the
//! quad-material registry, sharing render-wgpu's `material_renderers` table (a material kind is
//! either 2D or 3D, never both).

use std::sync::Arc;

use flight_entity::Kind;
use flight_materials::{Material, STANDARD_MATERIAL_KIND};
use flight_registry::with_kind_map_entry;
use flight_render_wgpu::{
    WgpuMaterialRenderer, WgpuMeshMaterialRenderer, WgpuRenderState,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

/// The 3D mesh-material renderer registered for a kind on this state, or `None` (TS
/// `getWgpuMeshMaterialRenderer`).
pub fn get_wgpu_mesh_material_renderer(
    state: &WgpuRenderState,
    kind: &str,
) -> Option<&'static WgpuMeshMaterialRenderer> {
    let entry = get_wgpu_render_state_runtime(state)
        .registries
        .material_renderers
        .entries
        .get(kind);
    return match entry {
        Some(WgpuMaterialRenderer::Mesh(renderer)) => Some(*renderer),
        _ => None,
    };
}

/// Registers a 3D mesh-material renderer against a material kind on this state (TS
/// `registerWgpuMeshMaterialRenderer`), copying the shared table so a derived state's snapshot is
/// untouched.
pub fn register_wgpu_mesh_material_renderer(
    state: &mut WgpuRenderState,
    kind: Kind,
    renderer: &'static WgpuMeshMaterialRenderer,
) {
    let registries = &mut get_wgpu_render_state_runtime_mut(state).registries;
    registries.material_renderers = Arc::new(with_kind_map_entry(
        &registries.material_renderers,
        kind,
        WgpuMaterialRenderer::Mesh(renderer),
    ));
}

/// Resolves a mesh subset's material to its registered 3D renderer (TS
/// `resolveWgpuMeshMaterialRenderer`): by the material's kind, else the renderer registered for
/// `STANDARD_MATERIAL_KIND`, else `None`.
pub fn resolve_wgpu_mesh_material_renderer(
    state: &WgpuRenderState,
    material: Option<&dyn Material>,
) -> Option<&'static WgpuMeshMaterialRenderer> {
    if let Some(material) = material
        && let Some(renderer) =
            get_wgpu_mesh_material_renderer(state, &material.material_fields().kind)
    {
        return Some(renderer);
    }
    return get_wgpu_mesh_material_renderer(state, STANDARD_MATERIAL_KIND);
}
