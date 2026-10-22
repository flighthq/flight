use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::make_gl_scene3d_state;

mod get_gl_scene3d_time {
    use super::*;

    #[test]
    fn defaults_to_0_before_any_set_gl_scene3d_time() {
        let state = make_gl_scene3d_state();
        assert_eq!(get_gl_scene3d_time(&state), 0.0);
    }

    #[test]
    fn returns_the_value_set_by_set_gl_scene3d_time() {
        let state = make_gl_scene3d_state();
        set_gl_scene3d_time(&state, 2.75);
        assert_eq!(get_gl_scene3d_time(&state), 2.75);
    }
}

mod set_gl_scene3d_time {
    use super::*;

    #[test]
    fn overwrites_the_stored_time_on_repeated_calls() {
        let state = make_gl_scene3d_state();
        set_gl_scene3d_time(&state, 1.0);
        set_gl_scene3d_time(&state, 4.5);
        assert_eq!(get_gl_scene3d_time(&state), 4.5);
    }

    #[test]
    fn keeps_time_per_state_two_states_do_not_share() {
        let a = make_gl_scene3d_state();
        let b = make_gl_scene3d_state();
        set_gl_scene3d_time(&a, 3.0);
        assert_eq!(get_gl_scene3d_time(&b), 0.0);
    }
}
