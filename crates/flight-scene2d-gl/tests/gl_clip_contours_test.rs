use flight_geometry::create_matrix;
use flight_path::PathWinding;
use flight_scene2d_gl::*;

use crate::gl_test_helper::{calls_with, create_gl_state, last_call};

fn square() -> Vec<Vec<f64>> {
    return vec![vec![0.0, 0.0, 50.0, 0.0, 50.0, 50.0, 0.0, 50.0]];
}

fn identity() -> flight_geometry::Matrix {
    return create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

mod pop_gl_clip_contours {
    use super::*;

    #[test]
    fn decrements_the_stencil_depth_and_disables_the_stencil_test_at_depth_0() {
        let mut state = create_gl_state();
        push_gl_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());
        assert_eq!(state.gl_runtime.borrow().current_mask_depth, 1);

        pop_gl_clip_contours(&mut state);

        assert_eq!(state.gl_runtime.borrow().current_mask_depth, 0);
        assert!(
            calls_with("disable")
                .iter()
                .any(|call| call.integers == vec![i64::from(glow::STENCIL_TEST)])
        );
    }
}

mod push_gl_clip_contours {
    use super::*;

    #[test]
    fn enables_the_stencil_test_and_clears_the_buffer_when_opening_the_first_clip() {
        let mut state = create_gl_state();

        push_gl_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());

        assert!(
            calls_with("enable")
                .iter()
                .any(|call| call.integers == vec![i64::from(glow::STENCIL_TEST)])
        );
        assert!(
            calls_with("clear")
                .iter()
                .any(|call| call.integers == vec![i64::from(glow::STENCIL_BUFFER_BIT)])
        );
        assert_eq!(state.gl_runtime.borrow().current_mask_depth, 1);
    }

    #[test]
    fn syncs_state_current_shader_to_the_clip_program_so_content_draws_re_bind_their_own_program() {
        let mut state = create_gl_state();
        assert!(state.context_state.runtime_state.borrow().binding.is_none());

        push_gl_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());

        assert!(state.context_state.runtime_state.borrow().binding.is_some());
    }

    #[test]
    fn re_enables_color_writes_after_stencilling_so_gated_content_is_drawn() {
        let mut state = create_gl_state();

        push_gl_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());

        assert_eq!(last_call("color_mask").integers, vec![1, 1, 1, 1]);
    }

    #[test]
    fn uses_the_even_odd_stencil_op_for_an_even_odd_winding() {
        let mut state = create_gl_state();

        push_gl_clip_contours(&mut state, &square(), PathWinding::EvenOdd, &identity());

        assert!(calls_with("stencil_op").iter().any(|call| {
            call.integers
                == vec![
                    i64::from(glow::KEEP),
                    i64::from(glow::KEEP),
                    i64::from(glow::INVERT),
                ]
        }));
    }
}
