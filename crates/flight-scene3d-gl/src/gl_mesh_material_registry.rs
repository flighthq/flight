use std::sync::Arc;

use flight_entity::Kind;
use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::GlMeshMaterialRenderer;

pub fn has_gl_mesh_material_renderer(state: &GlRenderState, kind: &Kind) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.material_renderers.contains_key(kind));
}

pub fn register_gl_mesh_material_renderer(
    state: &GlRenderState,
    kind: Kind,
    renderer: Arc<dyn GlMeshMaterialRenderer>,
) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.material_renderers.insert(kind, renderer);
    });
}
