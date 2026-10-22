use flight_scene3d_gl::contract::*;
use glow::HasContext;

use crate::gl_test_helper::make_gl_scene3d_state;

mod set_gl_pbr_transmission_scene_color {
    use super::*;

    #[test]
    fn stores_and_clears_the_caller_owned_transmission_input() {
        let state = make_gl_scene3d_state();
        // SAFETY: allocation occurs on the deterministic mock context's owning thread.
        let texture = unsafe { state.gl.create_texture() }.unwrap();
        let scene_color = GlPbrTransmissionSceneColor {
            height: 64,
            mip_level_count: 7,
            texture,
            width: 64,
        };
        set_gl_pbr_transmission_scene_color(&state, Some(&scene_color));
        assert_eq!(
            get_gl_scene3d_runtime(&state).pbr_transmission_scene_color,
            Some(scene_color)
        );
        set_gl_pbr_transmission_scene_color(&state, None);
        assert_eq!(
            get_gl_scene3d_runtime(&state).pbr_transmission_scene_color,
            None
        );
    }
}
