use std::sync::Arc;

use flight_render_gl::GlRenderState;
use flight_scene2d_gl::*;

use crate::gl_test_helper::create_gl_state;

fn make_rasterizer() -> ShapeRasterizer<GlRenderState> {
    return Arc::new(|_, _, _| {});
}

mod get_gl_shape_rasterizer {
    use super::*;

    #[test]
    fn reports_none_until_one_is_registered() {
        let state = create_gl_state();
        assert!(get_gl_shape_rasterizer(&state).is_none());
    }
}

mod register_gl_shape_rasterizer {
    use super::*;

    #[test]
    fn installs_the_rasterizer_the_shape_path_draws_non_solid_fills_through() {
        let mut state = create_gl_state();
        let rasterizer = make_rasterizer();
        let before = state.gl_registries.shape_rasterizer.clone();

        register_gl_shape_rasterizer(&mut state, Some(rasterizer.clone()));

        assert!(Arc::ptr_eq(&get_gl_shape_rasterizer(&state).unwrap(), &rasterizer));
        assert!(state.gl_registries.shape_rasterizer.is_some());
        assert!(before.is_none());
    }

    #[test]
    fn removes_one_again_so_a_state_can_drop_back_to_tessellation_only() {
        let mut state = create_gl_state();
        register_gl_shape_rasterizer(&mut state, Some(make_rasterizer()));
        let before = state.gl_registries.shape_rasterizer.clone();

        register_gl_shape_rasterizer(&mut state, None);

        assert!(get_gl_shape_rasterizer(&state).is_none());
        assert!(state.gl_registries.shape_rasterizer.is_none());
        assert!(before.is_some());
    }
}
