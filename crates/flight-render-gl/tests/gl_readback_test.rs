mod read_gl_render_target_pixels {
    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, last_call, make_state, make_texture_target,
        set_framebuffer_status,
    };
    use flight_render_gl::{read_gl_render_target_pixels, GlReadbackBuffer};

    #[test]
    fn returns_false_for_a_zero_height_target_without_touching_gl() {
        let state = make_state();
        let mut target = make_texture_target(&state, 4.0, 4.0);
        target.axes.height = 0;
        clear_calls();
        let mut output = [0_u8; 4];
        assert!(!read_gl_render_target_pixels(
            &state,
            &target,
            0,
            0,
            1,
            1,
            GlReadbackBuffer::U8(&mut output),
        ));
        assert_eq!(calls_named("bind_framebuffer"), 0);
        assert_eq!(calls_named("read_pixels"), 0);
    }

    #[test]
    fn returns_false_for_a_zero_width_target_without_touching_gl() {
        let state = make_state();
        let mut target = make_texture_target(&state, 4.0, 4.0);
        target.axes.width = 0;
        clear_calls();
        let mut output = [0_u8; 4];
        assert!(!read_gl_render_target_pixels(
            &state,
            &target,
            0,
            0,
            1,
            1,
            GlReadbackBuffer::U8(&mut output),
        ));
        assert_eq!(calls_named("bind_framebuffer"), 0);
        assert_eq!(calls_named("read_pixels"), 0);
    }

    #[test]
    fn returns_false_when_the_framebuffer_is_incomplete_and_restores_the_binding() {
        let state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        let previous = make_texture_target(&state, 1.0, 1.0).framebuffer;
        state.gl_runtime.borrow_mut().current_framebuffer = Some(previous);
        set_framebuffer_status(glow::FRAMEBUFFER_INCOMPLETE_ATTACHMENT);
        clear_calls();
        let mut output = [0_u8; 4];
        assert!(!read_gl_render_target_pixels(
            &state,
            &target,
            0,
            0,
            1,
            1,
            GlReadbackBuffer::U8(&mut output),
        ));
        assert_eq!(calls_named("read_pixels"), 0);
        let binds = calls_with("bind_framebuffer");
        assert_eq!(binds.len(), 2);
        assert_eq!(binds[0].integers[0], i64::from(glow::READ_FRAMEBUFFER));
        assert_eq!(binds[0].integers[1], i64::from(target.framebuffer.0.get()));
        assert_eq!(binds[1].integers[0], i64::from(glow::READ_FRAMEBUFFER));
        assert_eq!(binds[1].integers[1], i64::from(previous.0.get()));
    }

    #[test]
    fn returns_true_and_reads_exact_rgba_bytes_when_the_framebuffer_is_complete() {
        let state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        let mut output = [255_u8; 16];
        assert!(read_gl_render_target_pixels(
            &state,
            &target,
            3,
            5,
            2,
            2,
            GlReadbackBuffer::U8(&mut output),
        ));
        assert_eq!(output, [0; 16]);
        assert_eq!(
            last_call("read_pixels").integers,
            vec![
                3,
                5,
                2,
                2,
                i64::from(glow::RGBA),
                i64::from(glow::UNSIGNED_BYTE),
                0,
            ],
        );
    }

    #[test]
    fn uses_float_type_for_f32_output() {
        let state = make_state();
        let target = make_texture_target(&state, 4.0, 4.0);
        clear_calls();
        let mut output = [255.0_f32; 16];
        assert!(read_gl_render_target_pixels(
            &state,
            &target,
            0,
            0,
            4,
            4,
            GlReadbackBuffer::F32(&mut output),
        ));
        assert_eq!(output, [0.0; 16]);
        assert_eq!(
            last_call("read_pixels").integers,
            vec![0, 0, 4, 4, i64::from(glow::RGBA), i64::from(glow::FLOAT), 0,],
        );
    }

    #[test]
    fn uses_the_resolve_framebuffer_for_reading_instead_of_the_draw_framebuffer() {
        let state = make_state();
        let mut target = make_texture_target(&state, 4.0, 4.0);
        let resolve = make_texture_target(&state, 4.0, 4.0).framebuffer;
        assert_ne!(target.framebuffer, resolve);
        target.resolve_framebuffer = Some(resolve);
        clear_calls();
        let mut output = [0_u8; 4];
        assert!(read_gl_render_target_pixels(
            &state,
            &target,
            0,
            0,
            1,
            1,
            GlReadbackBuffer::U8(&mut output),
        ));
        let binds = calls_with("bind_framebuffer");
        let first_bind = &binds[0];
        assert_eq!(first_bind.integers[0], i64::from(glow::READ_FRAMEBUFFER));
        assert_eq!(first_bind.integers[1], i64::from(resolve.0.get()));
        assert_ne!(
            first_bind.integers[1],
            i64::from(target.framebuffer.0.get())
        );
    }
}
