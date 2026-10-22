mod draw_gl_linear_to_srgb_pass {
    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, make_state, make_texture_target,
    };
    use flight_render_gl::{draw_gl_linear_to_srgb_pass, LINEAR_TO_SRGB_FRAGMENT_SOURCE};

    #[test]
    fn binds_the_source_texture_and_draws_to_the_canvas_when_destination_is_none() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        clear_calls();

        draw_gl_linear_to_srgb_pass(&mut state, &source, None).unwrap();

        let texture_binds = calls_with("bind_texture");
        assert_eq!(
            texture_binds.first().unwrap().integers,
            vec![
                i64::from(glow::TEXTURE_2D),
                i64::from(source.texture.0.get()),
            ]
        );
        assert_eq!(
            calls_with("viewport").last().unwrap().integers,
            vec![0, 0, 640, 480]
        );
        assert_eq!(calls_named("draw_elements"), 1);
    }

    #[test]
    fn presents_into_the_destination_when_a_target_is_given() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        let destination = make_texture_target(&state, 19.0, 11.0);
        clear_calls();

        draw_gl_linear_to_srgb_pass(&mut state, &source, Some(&destination)).unwrap();

        assert_eq!(
            calls_with("bind_framebuffer").last().unwrap().integers,
            vec![
                i64::from(glow::FRAMEBUFFER),
                i64::from(destination.framebuffer.0.get()),
            ]
        );
        assert_eq!(
            calls_with("viewport").last().unwrap().integers,
            vec![0, 0, 19, 11]
        );
    }

    #[test]
    fn compiles_its_program_once_per_state_and_reuses_it_across_frames() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        clear_calls();

        draw_gl_linear_to_srgb_pass(&mut state, &source, None).unwrap();
        draw_gl_linear_to_srgb_pass(&mut state, &source, None).unwrap();
        draw_gl_linear_to_srgb_pass(&mut state, &source, None).unwrap();

        assert_eq!(calls_named("create_program"), 1);
        assert_eq!(calls_named("draw_elements"), 3);
        assert_eq!(
            state
                .context_state
                .runtime_state
                .borrow()
                .fullscreen_programs
                .len(),
            1
        );
    }

    #[test]
    fn encodes_the_exact_srgb_oetf_constants_and_preserves_alpha() {
        assert!(LINEAR_TO_SRGB_FRAGMENT_SOURCE.contains("0.0031308"));
        assert!(LINEAR_TO_SRGB_FRAGMENT_SOURCE.contains("12.92"));
        assert!(LINEAR_TO_SRGB_FRAGMENT_SOURCE.contains("1.055"));
        assert!(LINEAR_TO_SRGB_FRAGMENT_SOURCE.contains("1.0 / 2.4"));
        assert!(LINEAR_TO_SRGB_FRAGMENT_SOURCE.contains("0.055"));
        assert!(LINEAR_TO_SRGB_FRAGMENT_SOURCE.contains("linear.a"));
    }
}
