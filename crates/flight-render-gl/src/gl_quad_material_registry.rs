// flight-lint: allow-file(contract-vocabulary) D17 material renderer registration uses the open native trait contract

use std::sync::Arc;

use flight_entity::Kind;
use flight_materials::{Material, STANDARD_MATERIAL_KIND};
use flight_registry::with_kind_map_entry;
use flight_render::{RenderRegistryTable, emit_render_registry_miss};

use crate::{GlQuadMaterialRenderer, GlRenderState};

pub fn get_gl_quad_material_renderer(
    state: &GlRenderState,
    kind: &Kind,
) -> Option<&'static dyn GlQuadMaterialRenderer> {
    return state
        .gl_registries
        .material_renderers
        .entries
        .get(kind)
        .copied();
}

pub fn register_gl_quad_material_renderer(
    state: &mut GlRenderState,
    kind: Kind,
    renderer: &'static dyn GlQuadMaterialRenderer,
) {
    state.gl_registries.material_renderers = Arc::new(with_kind_map_entry(
        &state.gl_registries.material_renderers,
        kind,
        renderer,
    ));
}

pub fn resolve_gl_quad_material_renderer(
    state: &mut GlRenderState,
    material: Option<&dyn Material>,
) -> Option<&'static dyn GlQuadMaterialRenderer> {
    let kind = material.map_or(STANDARD_MATERIAL_KIND, |value| {
        value.material_fields().kind.as_str()
    });
    if let Some(renderer) = state
        .gl_registries
        .material_renderers
        .entries
        .get(kind)
        .copied()
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
    return state
        .gl_registries
        .material_renderers
        .entries
        .get(STANDARD_MATERIAL_KIND)
        .copied();
}
