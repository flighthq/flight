// flight-lint: allow-file(contract-vocabulary) D17 material renderer registration uses the open native trait contract

use std::sync::Arc;

use flight_entity::Kind;
use flight_materials::{Material, STANDARD_MATERIAL_KIND};
use flight_registry::with_kind_map_entry;
use flight_render::{RenderRegistryTable, emit_render_registry_miss};

use crate::{GlMaterialRenderer, GlQuadMaterialRenderer, GlRenderState};

// Narrows a shared material-renderer table entry to the 2D quad seam; a mesh (3D) entry is not one.
fn as_gl_quad_material_renderer(
    entry: Option<&GlMaterialRenderer>,
) -> Option<&'static dyn GlQuadMaterialRenderer> {
    return match entry {
        Some(GlMaterialRenderer::Quad(renderer)) => Some(*renderer),
        _ => None,
    };
}

pub fn get_gl_quad_material_renderer(
    state: &GlRenderState,
    kind: &Kind,
) -> Option<&'static dyn GlQuadMaterialRenderer> {
    return as_gl_quad_material_renderer(state.gl_registries.material_renderers.entries.get(kind));
}

pub fn register_gl_quad_material_renderer(
    state: &mut GlRenderState,
    kind: Kind,
    renderer: &'static dyn GlQuadMaterialRenderer,
) {
    state.gl_registries.material_renderers = Arc::new(with_kind_map_entry(
        &state.gl_registries.material_renderers,
        kind,
        GlMaterialRenderer::Quad(renderer),
    ));
}

pub fn resolve_gl_quad_material_renderer(
    state: &mut GlRenderState,
    material: Option<&dyn Material>,
) -> Option<&'static dyn GlQuadMaterialRenderer> {
    let kind = material.map_or(STANDARD_MATERIAL_KIND, |value| {
        value.material_fields().kind.as_str()
    });
    if let Some(renderer) =
        as_gl_quad_material_renderer(state.gl_registries.material_renderers.entries.get(kind))
    {
        return Some(renderer);
    }
    emit_render_registry_miss(
        state,
        RenderRegistryTable::MaterialRenderer,
        kind.to_string(),
    );
    if kind == STANDARD_MATERIAL_KIND {
        return None;
    }
    return as_gl_quad_material_renderer(
        state
            .gl_registries
            .material_renderers
            .entries
            .get(STANDARD_MATERIAL_KIND),
    );
}
