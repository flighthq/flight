mod are_gl_render_texture_guards_enabled {
    use flight_render_gl::{are_gl_render_texture_guards_enabled, enable_gl_render_texture_guards};

    use crate::gl_test_helper::make_state;

    #[test]
    fn distinguishes_the_standard_guard_from_an_empty_slot() {
        let state = make_state();
        assert!(!are_gl_render_texture_guards_enabled(&state));
        enable_gl_render_texture_guards(&state, None);
        assert!(are_gl_render_texture_guards_enabled(&state));
    }
}

mod enable_gl_render_texture_guards {
    use flight_render_gl::{are_gl_render_texture_guards_enabled, enable_gl_render_texture_guards};

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_idempotent_and_retains_the_caller_owned_optional_log_state() {
        let state = make_state();
        enable_gl_render_texture_guards(&state, None);
        let guard = state.gl_runtime.borrow().render_texture_guard.unwrap();
        enable_gl_render_texture_guards(&state, None);
        assert!(are_gl_render_texture_guards_enabled(&state));
        assert!(state.gl_runtime.borrow().render_texture_guard_log.is_none());
        assert!(std::ptr::fn_addr_eq(
            state.gl_runtime.borrow().render_texture_guard.unwrap(),
            guard,
        ));
    }
}
