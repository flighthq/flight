// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use std::sync::Arc;

use flight_entity::Kind;
use flight_materials::{Material, STANDARD_MATERIAL_KIND};
use flight_registry::with_kind_map_entry;
use flight_render_gl::{GlMaterialRenderer, GlMeshMaterialRenderer, GlRenderState};

// Narrows a shared material-renderer table entry to the 3D mesh seam; a quad (2D) entry is not one.
fn as_gl_mesh_material_renderer(
    entry: Option<&GlMaterialRenderer>,
) -> Option<&'static GlMeshMaterialRenderer> {
    return match entry {
        Some(GlMaterialRenderer::Mesh(renderer)) => Some(*renderer),
        _ => None,
    };
}

// Returns the 3D mesh-material renderer registered for a kind on this state, or None. The 3D analog
// of get_gl_quad_material_renderer; reads the shared material_renderers table (a material kind is
// either 2D or 3D, never both).
pub fn get_gl_mesh_material_renderer(
    state: &GlRenderState,
    kind: &Kind,
) -> Option<&'static GlMeshMaterialRenderer> {
    return as_gl_mesh_material_renderer(state.gl_registries.material_renderers.entries.get(kind));
}

// Registers a 3D mesh-material renderer against a material kind on this state. Opt-in:
// render_gl_scene3d only draws subsets whose material kind (or StandardMaterialKind) has a renderer
// here. Writes into the shared material_renderers table alongside 2D quad-material entries.
pub fn register_gl_mesh_material_renderer(
    state: &mut GlRenderState,
    kind: Kind,
    renderer: &'static GlMeshMaterialRenderer,
) {
    state.gl_registries.material_renderers = Arc::new(with_kind_map_entry(
        &state.gl_registries.material_renderers,
        kind,
        GlMaterialRenderer::Mesh(renderer),
    ));
}

// Resolves a mesh subset's material to its registered 3D renderer: by the material's kind, else the
// renderer registered for StandardMaterialKind, else None (the subset is skipped; no built-in
// fallback).
pub fn resolve_gl_mesh_material_renderer(
    state: &GlRenderState,
    material: Option<&dyn Material>,
) -> Option<&'static GlMeshMaterialRenderer> {
    let table = &state.gl_registries.material_renderers.entries;
    if let Some(material) = material {
        if let Some(renderer) = as_gl_mesh_material_renderer(table.get(&material.material_fields().kind)) {
            return Some(renderer);
        }
    }
    return as_gl_mesh_material_renderer(table.get(STANDARD_MATERIAL_KIND));
}
