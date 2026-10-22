//! Private plumbing shared by the quad-batch node renderers (the source inlines it per renderer).

use std::sync::{Arc, RwLock};

use flight_materials::{Material, MaterialData};
use flight_node::{NodeRef, RendererData, RendererDataRef};
use flight_render::RenderProxy2D;
use flight_render_gl::{GlQuadMaterialRenderer, GlRenderState, resolve_gl_quad_material_renderer};
use flight_scene2d::{create_sprite_renderer_data, is_sprite_renderer_dirty};

// TS `createSpriteRendererData` as a GL `NodeRenderer.create_data` callback.
pub(crate) fn create_gl_sprite_renderer_data(
    _state: &mut GlRenderState,
    source: &NodeRef,
) -> Option<RendererDataRef> {
    let data = create_sprite_renderer_data(&*source.read().unwrap());
    return Some(Arc::new(RwLock::new(data)));
}

// The straight-alpha flag of the texture realization bound by the last resolve.
pub(crate) fn current_gl_straight_alpha(state: &GlRenderState) -> bool {
    return state
        .context_state
        .runtime_state
        .borrow()
        .current_texture_realization
        .is_some_and(|realization| realization.straight_alpha);
}

// TS `isSpriteRendererDirty` as a GL `NodeRenderer.is_dirty` callback.
pub(crate) fn is_gl_sprite_renderer_dirty(
    _state: &GlRenderState,
    source: &NodeRef,
    renderer_data: Option<&RendererDataRef>,
) -> bool {
    let Some(renderer_data) = renderer_data else {
        return is_sprite_renderer_dirty(&*source.read().unwrap(), None);
    };
    let mut guard = renderer_data.write().unwrap();
    let data: &mut dyn RendererData = &mut *guard;
    return is_sprite_renderer_dirty(&*source.read().unwrap(), Some(data));
}

// Packs one instance's material floats from an optional shared material-data handle.
pub(crate) fn pack_gl_proxy_material_instance(
    state: &mut GlRenderState,
    material_data: Option<&flight_entity::Ref<dyn MaterialData>>,
    instance_index: usize,
) {
    let guard = material_data.map(|value| value.read().unwrap());
    crate::gl_quad_batch_writer::pack_gl_quad_batch_material_instance(
        state,
        guard.as_deref(),
        instance_index,
    );
}

// Resolves the material renderer of a proxy's material (TS `resolveGlQuadMaterialRenderer(state,
// renderProxy.material)`).
pub(crate) fn resolve_gl_proxy_material_renderer(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
) -> Option<&'static dyn GlQuadMaterialRenderer> {
    let guard = render_proxy
        .material
        .as_ref()
        .map(|material| material.read().unwrap());
    let material: Option<&dyn Material> = guard.as_deref().map(|value| value as &dyn Material);
    return resolve_gl_quad_material_renderer(state, material);
}
