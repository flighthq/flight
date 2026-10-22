// flight-lint: allow-file(contract-vocabulary) D17 material renderers implement render-gl's open native trait contract

use flight_materials::{Material2D, STANDARD_MATERIAL_KIND};
use flight_render_gl::{GlQuadMaterialRenderer, GlRenderState, register_gl_quad_material_renderer};

use crate::gl_quad_batch_writer::{
    bind_gl_quad_batch_base_attributes, ensure_gl_quad_batch_shader,
    set_gl_quad_batch_world_and_texture, use_gl_quad_batch_program,
};

/// The bundled default material renderer (TS `standardGlQuadMaterialRenderer`): the plain
/// textured-quad pipeline with no per-instance material floats.
pub struct StandardGlQuadMaterialRenderer;

pub static STANDARD_GL_QUAD_MATERIAL_RENDERER: StandardGlQuadMaterialRenderer =
    StandardGlQuadMaterialRenderer;

// Registers the bundled default material (the plain textured-quad pipeline) under
// STANDARD_MATERIAL_KIND. It has no privileged status in the render path; a node with no material
// renders only if a renderer is registered for STANDARD_MATERIAL_KIND.
pub fn register_gl_standard_material(state: &mut GlRenderState) {
    register_gl_quad_material_renderer(
        state,
        STANDARD_MATERIAL_KIND.to_string(),
        &STANDARD_GL_QUAD_MATERIAL_RENDERER,
    );
}

// flight-lint: allow(sugar-delegates) open render-gl dispatch trait: the TS renderer object literal carries this field and method directly
impl GlQuadMaterialRenderer for StandardGlQuadMaterialRenderer {
    fn bind(&self, state: &mut GlRenderState, _material: Option<&dyn Material2D>) {
        let shader = ensure_gl_quad_batch_shader(state);
        use_gl_quad_batch_program(state, shader.program);
        set_gl_quad_batch_world_and_texture(
            state,
            shader.loc_world_matrix.as_ref(),
            shader.loc_texture.as_ref(),
            shader.loc_straight_texture_alpha.as_ref(),
        );
        bind_gl_quad_batch_base_attributes(state, shader.loc_corner);
    }

    fn instance_float_count(&self) -> usize {
        return 0;
    }
}
