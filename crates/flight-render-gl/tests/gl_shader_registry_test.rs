mod register_gl_bitmap_shader {
    use std::sync::Arc;

    use flight_render_gl::{
        compile_default_gl_program, create_default_gl_bitmap_shader, register_gl_bitmap_shader,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn stores_the_exact_shader_identity_as_the_default() {
        let state = make_state();
        let shader =
            create_default_gl_bitmap_shader(compile_default_gl_program(&state.gl).unwrap());
        register_gl_bitmap_shader(&state, Arc::clone(&shader));
        let stored = state
            .gl_runtime
            .borrow()
            .default_bitmap_shader
            .clone()
            .unwrap();
        assert!(Arc::ptr_eq(&shader, &stored));
    }
}
