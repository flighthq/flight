use glow::HasContext;

use crate::gl_test_helper::{call_names, make_gl_scene3d_state, take_gl_error};

mod make_fake_gl2 {
    use super::*;

    #[test]
    fn sets_and_consumes_the_first_gl_draw_error_without_recording_an_invalid_draw() {
        let state = make_gl_scene3d_state();

        // SAFETY: the mock validates the draw on the test thread without touching memory.
        unsafe {
            state.gl.draw_elements(glow::TRIANGLES, -1, glow::UNSIGNED_SHORT, 0);
            state.gl.draw_elements(0xffff, 1, glow::UNSIGNED_SHORT, 0);
        }

        assert!(!call_names().iter().any(|name| name == "draw_elements"));
        assert_eq!(take_gl_error(&state), glow::INVALID_VALUE);
        assert_eq!(take_gl_error(&state), glow::NO_ERROR);
    }

    #[test]
    fn reports_a_type_misaligned_index_offset_as_invalid_operation() {
        let state = make_gl_scene3d_state();

        // SAFETY: the mock validates the draw on the test thread without touching memory.
        unsafe { state.gl.draw_elements(glow::TRIANGLES, 1, glow::UNSIGNED_SHORT, 1) };

        assert!(!call_names().iter().any(|name| name == "draw_elements"));
        assert_eq!(take_gl_error(&state), glow::INVALID_OPERATION);
        assert_eq!(take_gl_error(&state), glow::NO_ERROR);
    }

    #[test]
    fn validates_non_indexed_and_instanced_draw_entry_points() {
        let state = make_gl_scene3d_state();

        // SAFETY: the mock validates each draw on the test thread without touching memory.
        unsafe { state.gl.draw_arrays(0xffff, 0, 1) };
        assert_eq!(take_gl_error(&state), glow::INVALID_ENUM);

        // SAFETY: as above.
        unsafe { state.gl.draw_arrays_instanced(glow::TRIANGLES, 0, 1, -1) };
        assert_eq!(take_gl_error(&state), glow::INVALID_VALUE);

        // SAFETY: as above.
        unsafe { state.gl.draw_elements_instanced(glow::TRIANGLES, 1, glow::FLOAT, 0, 1) };
        assert_eq!(take_gl_error(&state), glow::INVALID_ENUM);
        assert!(!call_names().iter().any(|name| name.starts_with("draw")));
        assert_eq!(take_gl_error(&state), glow::NO_ERROR);
    }
}
