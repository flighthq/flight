// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! The quad-batch material renderer table (TS `wgpuQuadMaterialRegistry.ts`).

use std::sync::Arc;

use flight_entity::Kind;
use flight_materials::{Material, STANDARD_MATERIAL_KIND};
use flight_registry::with_kind_map_entry;
use flight_render::{RenderRegistryTable, emit_render_registry_miss};

use crate::types::*;

fn as_quad_renderer(entry: Option<&WgpuMaterialRenderer>) -> Option<WgpuQuadMaterialRenderer> {
    return match entry {
        Some(WgpuMaterialRenderer::Quad(renderer)) => Some(renderer.clone()),
        _ => None,
    };
}

/// The quad renderer registered for `kind`, or `None` (TS `getWgpuQuadMaterialRenderer`). A mesh
/// renderer under that kind is not a quad renderer.
pub fn get_wgpu_quad_material_renderer(
    state: &WgpuRenderState,
    kind: &Kind,
) -> Option<WgpuQuadMaterialRenderer> {
    return as_quad_renderer(
        state
            .runtime
            .registries
            .material_renderers
            .entries
            .get(kind),
    );
}

/// Registers or replaces the quad renderer for a material kind (TS
/// `registerWgpuQuadMaterialRenderer`).
pub fn register_wgpu_quad_material_renderer(
    state: &mut WgpuRenderState,
    kind: Kind,
    renderer: WgpuQuadMaterialRenderer,
) {
    let registries = &mut state.runtime.registries;
    registries.material_renderers = Arc::new(with_kind_map_entry(
        &registries.material_renderers,
        kind,
        WgpuMaterialRenderer::Quad(renderer),
    ));
}

/// Resolves a material to its registered renderer: by its kind, else the renderer registered for
/// `STANDARD_MATERIAL_KIND`, else `None` (TS `resolveWgpuQuadMaterialRenderer`). Every material,
/// the default included, enters only through registration; an unresolved material does not render.
pub fn resolve_wgpu_quad_material_renderer(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
) -> Option<WgpuQuadMaterialRenderer> {
    let kind = material
        .map(|material| material.material_fields().kind.clone())
        .unwrap_or_else(|| STANDARD_MATERIAL_KIND.to_string());
    let table = state.runtime.registries.material_renderers.clone();
    if let Some(entry) = table.entries.get(&kind) {
        return as_quad_renderer(Some(entry));
    }
    // The requested kind is absent. The standard kind still stands in where it is registered, but
    // the miss is reported either way: substituting a different shading family is as much worth
    // knowing as drawing nothing, and the seam records one miss per kind.
    emit_render_registry_miss(state, RenderRegistryTable::MaterialRenderer, kind.clone());
    if kind == STANDARD_MATERIAL_KIND {
        return None;
    }
    return as_quad_renderer(table.entries.get(STANDARD_MATERIAL_KIND));
}
