use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_scene3d_gl::*;

use crate::gl_test_helper::make_gl_scene3d_state;

mod register_gl_standard_pbr_material {
    use super::*;

    #[test]
    fn registers_the_standard_pbr_renderer_for_standard_pbr_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let renderer =
            get_gl_mesh_material_renderer(&state, &STANDARD_PBR_MATERIAL_KIND.to_string());
        assert!(renderer.is_some_and(|renderer| std::ptr::eq(
            renderer,
            &GL_STANDARD_PBR_MESH_MATERIAL_RENDERER
        )));
    }

    #[test]
    fn does_not_imply_texture_source_registration() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        assert_eq!(state.gl_registries.texture_resolvers.entries.len(), 0);
    }
}
