use flight_scene2d_gl::contract::*;

use crate::gl_test_helper::create_gl_state;

mod enable_gl_stroke_path_tessellation {
    use super::*;

    #[test]
    fn replaces_the_full_stroke_tessellator_policy_slot() {
        let mut state = create_gl_state();
        // Nothing allocates the slot until the opt-in runs.
        assert!(state.registries.stroke_tessellator.is_none());

        enable_gl_stroke_path_tessellation(&mut state);

        assert!(state.registries.stroke_tessellator.is_some());
    }
}
