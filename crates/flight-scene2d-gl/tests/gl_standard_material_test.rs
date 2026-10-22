use flight_materials::STANDARD_MATERIAL_KIND;
use flight_render_gl::{GlQuadMaterialRenderer, get_gl_quad_material_renderer};
use flight_scene2d_gl::contract::*;

use crate::gl_test_helper::create_gl_state;

mod register_gl_standard_material {
    use super::*;

    #[test]
    fn registers_the_default_renderer_under_standard_material_kind() {
        let mut state = create_gl_state();
        register_gl_standard_material(&mut state);
        let renderer =
            get_gl_quad_material_renderer(&state, &STANDARD_MATERIAL_KIND.to_string()).unwrap();
        assert!(std::ptr::addr_eq(
            renderer as *const dyn GlQuadMaterialRenderer,
            &STANDARD_GL_QUAD_MATERIAL_RENDERER as *const StandardGlQuadMaterialRenderer
        ));
    }

    #[test]
    fn standard_renderer_declares_no_per_instance_float_data() {
        assert_eq!(
            GlQuadMaterialRenderer::instance_float_count(&STANDARD_GL_QUAD_MATERIAL_RENDERER),
            0
        );
    }
}
