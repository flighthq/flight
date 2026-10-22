use flight_render_gl::GlViewportRect;
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::make_gl_scene3d_state;

mod get_gl_scene3d_viewport_aspect {
    use super::*;

    #[test]
    fn uses_the_active_render_pass_dimensions() {
        let state = make_gl_scene3d_state();
        state.gl_runtime.borrow_mut().render_target_viewport = Some(GlViewportRect {
            height: 100,
            width: 200,
            x: 10,
            y: 20,
        });
        assert_eq!(get_gl_scene3d_viewport_aspect(&state), 2.0);
    }
}
