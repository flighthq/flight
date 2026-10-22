use flight_geometry::{create_matrix, create_rectangle};
use flight_render_gl::GlViewportRect;
use flight_scene2d_gl::*;

use crate::gl_test_helper::{calls_with, create_gl_state, last_call};

fn identity() -> flight_geometry::Matrix {
    return create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

mod pop_gl_clip_rectangle {
    use super::*;

    #[test]
    fn restores_the_previous_scissor_rectangle() {
        let mut state = create_gl_state();
        push_gl_clip_rectangle(
            &mut state,
            &create_rectangle(0.0, 0.0, 100.0, 50.0),
            &identity(),
        );
        push_gl_clip_rectangle(
            &mut state,
            &create_rectangle(10.0, 10.0, 10.0, 10.0),
            &identity(),
        );

        pop_gl_clip_rectangle(&mut state);

        assert_eq!(last_call("scissor").integers, vec![0, 50, 100, 50]);
    }

    #[test]
    fn disables_scissor_testing_when_the_stack_becomes_empty() {
        let mut state = create_gl_state();
        push_gl_clip_rectangle(
            &mut state,
            &create_rectangle(0.0, 0.0, 100.0, 50.0),
            &identity(),
        );

        pop_gl_clip_rectangle(&mut state);

        assert_eq!(
            last_call("disable").integers,
            vec![i64::from(glow::SCISSOR_TEST)]
        );
        assert!(state.gl_runtime.borrow().current_scissor_rect.is_none());
    }
}

mod push_gl_clip_rectangle {
    use super::*;

    #[test]
    fn enables_scissor_testing_with_a_transformed_rectangle() {
        let mut state = create_gl_state();

        push_gl_clip_rectangle(
            &mut state,
            &create_rectangle(10.0, 20.0, 30.0, 40.0),
            &create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 6.0),
        );

        assert_eq!(
            last_call("enable").integers,
            vec![i64::from(glow::SCISSOR_TEST)]
        );
        assert_eq!(last_call("scissor").integers, vec![15, 34, 30, 40]);
    }

    #[test]
    fn intersects_nested_scissor_rectangles() {
        let mut state = create_gl_state();

        push_gl_clip_rectangle(
            &mut state,
            &create_rectangle(0.0, 0.0, 100.0, 100.0),
            &identity(),
        );
        push_gl_clip_rectangle(
            &mut state,
            &create_rectangle(50.0, 25.0, 100.0, 50.0),
            &identity(),
        );

        assert_eq!(last_call("scissor").integers, vec![50, 25, 50, 50]);
        assert_eq!(calls_with("scissor").len(), 2);
    }

    #[test]
    fn offsets_a_local_clip_into_the_active_partial_target_viewport() {
        let mut state = create_gl_state();
        state.gl_runtime.borrow_mut().render_target_viewport = Some(GlViewportRect {
            height: 100,
            width: 100,
            x: 200,
            y: 50,
        });

        push_gl_clip_rectangle(
            &mut state,
            &create_rectangle(10.0, 20.0, 30.0, 40.0),
            &identity(),
        );

        assert_eq!(last_call("scissor").integers, vec![210, 90, 30, 40]);
    }
}
