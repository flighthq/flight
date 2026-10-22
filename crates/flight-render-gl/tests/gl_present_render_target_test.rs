mod present_gl_render_target {
    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, make_state, make_texture_target,
    };
    use flight_render_gl::present_gl_render_target;
    use flight_texture::RenderTargetColorSpace;

    #[test]
    fn encodes_a_linear_target_to_srgb_and_draws_to_the_canvas() {
        let mut state = make_state();
        let mut source = make_texture_target(&state, 32.0, 16.0);
        source.axes.color_space = RenderTargetColorSpace::Linear;
        clear_calls();

        present_gl_render_target(&mut state, &source, None).unwrap();

        assert_eq!(
            calls_with("bind_texture").first().unwrap().integers,
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
        assert!(
            state
                .context_state
                .runtime_state
                .borrow()
                .fullscreen_programs
                .contains_key("linear-to-srgb")
        );
    }

    #[test]
    fn copies_an_srgb_target_straight_through_without_an_oetf_pass() {
        let mut state = make_state();
        let mut source = make_texture_target(&state, 32.0, 16.0);
        source.axes.color_space = RenderTargetColorSpace::Srgb;
        clear_calls();

        present_gl_render_target(&mut state, &source, None).unwrap();

        assert_eq!(
            calls_with("bind_texture").first().unwrap().integers,
            vec![
                i64::from(glow::TEXTURE_2D),
                i64::from(source.texture.0.get()),
            ]
        );
        assert_eq!(calls_named("draw_elements"), 1);
        let programs = &state
            .context_state
            .runtime_state
            .borrow()
            .fullscreen_programs;
        assert!(programs.contains_key("copy"));
        assert!(!programs.contains_key("linear-to-srgb"));
    }

    #[test]
    fn presents_into_the_destination_when_a_target_is_given() {
        let mut state = make_state();
        let mut source = make_texture_target(&state, 32.0, 16.0);
        source.axes.color_space = RenderTargetColorSpace::Srgb;
        let destination = make_texture_target(&state, 23.0, 13.0);
        clear_calls();

        present_gl_render_target(&mut state, &source, Some(&destination)).unwrap();

        assert_eq!(
            calls_with("bind_framebuffer").last().unwrap().integers,
            vec![
                i64::from(glow::FRAMEBUFFER),
                i64::from(destination.framebuffer.0.get()),
            ]
        );
        assert!(
            calls_with("viewport")
                .iter()
                .any(|call| call.integers == vec![0, 0, 23, 13])
        );
    }
}
