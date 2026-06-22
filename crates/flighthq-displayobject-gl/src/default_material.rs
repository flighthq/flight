//! GL default material — the fallback material renderer for undecorated bitmaps.

use flighthq_types::kind::KindId;
use flighthq_types::material::DefaultMaterialKind;

use crate::sprite_batch::{
    bind_gl_quad_batch_base_attributes, ensure_gl_quad_batch_shader,
    set_gl_quad_batch_world_and_texture, use_gl_quad_batch_program,
};
use flighthq_render_gl::GlRenderState;
use flighthq_render_gl::{GlMaterialRenderer, register_gl_material_renderer};

/// Default GL material renderer. Uses the plain instanced quad-batch shader with
/// no per-node color transform (uniforms-only, 0 per-instance floats).
pub struct GlDefaultMaterialRenderer;

impl GlMaterialRenderer for GlDefaultMaterialRenderer {
    fn instance_float_count(&self) -> u32 {
        0
    }

    fn bind(&self, state: &mut GlRenderState, _material_id: u64) {
        ensure_gl_quad_batch_shader(state);
        let shader = ensure_gl_quad_batch_shader(state);
        let program = shader.program;
        let loc_corner = shader.loc_corner;
        let loc_world = shader.loc_world_matrix.clone();
        let loc_texture = shader.loc_texture.clone();
        use_gl_quad_batch_program(state, program);
        if let (Some(loc_world), Some(loc_texture)) = (loc_world, loc_texture) {
            set_gl_quad_batch_world_and_texture(state, &loc_world, &loc_texture);
        }
        bind_gl_quad_batch_base_attributes(state, loc_corner);
    }
}

/// Registers the default GL material renderer on `state` for the
/// `DefaultMaterialKind`.
pub fn register_gl_default_material(state: &mut GlRenderState) {
    register_gl_material_renderer(
        state,
        KindId::of::<DefaultMaterialKind>(),
        Box::new(GlDefaultMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {}
