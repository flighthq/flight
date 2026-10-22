use flight_render_gl::GlRenderState;

use crate::gl_standard_pbr_mesh_material_renderer::register_gl_standard_pbr_material as register_inner;

pub fn register_gl_standard_pbr_material(state: &GlRenderState) {
    register_inner(state);
}
