// flight-lint: allow-file(test-default-call) Clear records use their canonical Rust defaults.
mod clear_gl_render_target {
    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, make_state, make_texture_target,
    };
    use flight_render_gl::{RenderTargetClear, clear_gl_render_target};

    #[test]
    fn clears_the_single_color_attachment() {
        let state = make_state();
        let target = make_texture_target(&state, 48.0, 24.0);
        clear_calls();
        clear_gl_render_target(
            &target,
            &RenderTargetClear {
                color: Some([1.0, 0.0, 0.5, 1.0]),
                colors: None,
                depth: None,
                stencil: None,
            },
        );
        assert_eq!(calls_named("clear_buffer_f32"), 1);
        assert_eq!(
            calls_with("bind_framebuffer")[0].integers,
            vec![
                i64::from(glow::FRAMEBUFFER),
                i64::from(target.framebuffer.0.get())
            ]
        );
        assert_eq!(calls_with("viewport")[0].integers, vec![0, 0, 48, 24]);
        assert_eq!(
            calls_with("clear_buffer_f32")[0].integers,
            vec![i64::from(glow::COLOR), 0]
        );
        assert_eq!(
            calls_with("clear_buffer_f32")[0].floats,
            vec![1.0, 0.0, 0.5, 1.0]
        );
    }
}

mod clear_gl_render_target_attachments {
    use crate::gl_test_helper::{calls_named, calls_with, clear_calls, make_gl, snapshot};
    use flight_render_gl::{
        RenderTargetClear, clear_gl_render_target_attachments, create_gl_screen_render_target,
    };
    use glow::HasContext;
    use std::rc::Rc;

    #[test]
    fn clears_each_attachment_at_its_original_index() {
        let gl = make_gl();
        let target = create_gl_screen_render_target(Rc::clone(&gl), 32, 16);
        clear_gl_render_target_attachments(
            &target,
            &RenderTargetClear {
                color: None,
                colors: Some(vec![Some([1.0, 0.0, 0.0, 1.0]), Some([0.0, 1.0, 0.0, 1.0])]),
                depth: None,
                stencil: None,
            },
        );
        let clears = calls_with("clear_buffer_f32");
        assert_eq!(clears.len(), 2);
        assert_eq!(clears[0].integers, vec![i64::from(glow::COLOR), 0]);
        assert_eq!(clears[1].integers, vec![i64::from(glow::COLOR), 1]);
        assert_eq!(clears[0].floats, vec![1.0, 0.0, 0.0, 1.0]);
        assert_eq!(clears[1].floats, vec![0.0, 1.0, 0.0, 1.0]);
    }

    #[test]
    fn clears_only_present_attachment_colors() {
        let gl = make_gl();
        let target = create_gl_screen_render_target(Rc::clone(&gl), 4, 5);
        clear_gl_render_target_attachments(
            &target,
            &RenderTargetClear {
                color: None,
                colors: Some(vec![Some([0.0; 4]), None, Some([1.0; 4])]),
                depth: None,
                stencil: None,
            },
        );
        assert_eq!(calls_named("clear_buffer_f32"), 2);
        let clears = calls_with("clear_buffer_f32");
        assert_eq!(clears[0].integers, vec![i64::from(glow::COLOR), 0]);
        assert_eq!(clears[1].integers, vec![i64::from(glow::COLOR), 2]);
        assert_eq!(clears[0].floats, vec![0.0; 4]);
        assert_eq!(clears[1].floats, vec![1.0; 4]);
    }

    #[test]
    fn disables_scissor_for_the_clear_and_restores_it_afterward() {
        let gl = make_gl();
        let target = create_gl_screen_render_target(Rc::clone(&gl), 32, 16);
        // SAFETY: the deterministic mock owns this context's capability state.
        unsafe { gl.enable(glow::SCISSOR_TEST) };
        clear_calls();
        clear_gl_render_target_attachments(
            &target,
            &RenderTargetClear {
                color: None,
                colors: Some(vec![Some([0.0; 4])]),
                depth: None,
                stencil: None,
            },
        );
        assert_eq!(
            calls_with("disable")[0].integers,
            vec![i64::from(glow::SCISSOR_TEST)]
        );
        assert_eq!(
            calls_with("enable")[0].integers,
            vec![i64::from(glow::SCISSOR_TEST)]
        );
        let calls = snapshot().calls;
        let disable = calls.iter().position(|name| name == "disable").unwrap();
        let clear = calls
            .iter()
            .position(|name| name == "clear_buffer_f32")
            .unwrap();
        let enable = calls.iter().position(|name| name == "enable").unwrap();
        assert!(disable < clear && clear < enable);
        assert!(snapshot().enabled.contains(&glow::SCISSOR_TEST));
    }

    #[test]
    fn skips_an_undefined_first_attachment_without_renumbering_the_next() {
        let gl = make_gl();
        let target = create_gl_screen_render_target(Rc::clone(&gl), 32, 16);
        clear_gl_render_target_attachments(
            &target,
            &RenderTargetClear {
                color: None,
                colors: Some(vec![None, Some([0.0, 0.0, 1.0, 1.0])]),
                depth: None,
                stencil: None,
            },
        );
        let clears = calls_with("clear_buffer_f32");
        assert_eq!(clears.len(), 1);
        assert_eq!(clears[0].integers, vec![i64::from(glow::COLOR), 1]);
        assert_eq!(clears[0].floats, vec![0.0, 0.0, 1.0, 1.0]);
    }
}

mod compile_gl_fullscreen_program {
    use crate::gl_test_helper::{make_gl, set_info_log, set_program_link, set_shader_compile};
    use flight_render_gl::compile_gl_fullscreen_program;

    #[test]
    fn reports_program_link_failure() {
        let gl = make_gl();
        set_program_link(false);
        set_info_log("program link error");
        assert_eq!(
            compile_gl_fullscreen_program(&gl, "void main(){}").unwrap_err(),
            "Fullscreen pass program link error: program link error"
        );
    }

    #[test]
    fn reports_vertex_shader_compilation_failure() {
        let gl = make_gl();
        set_shader_compile(false);
        set_info_log("shader compile error");
        assert_eq!(
            compile_gl_fullscreen_program(&gl, "void main(){}").unwrap_err(),
            "Fullscreen pass shader compile error: shader compile error"
        );
    }

    #[test]
    fn resolves_quad_attributes_and_sampler_array() {
        let program = compile_gl_fullscreen_program(&make_gl(), "void main(){}").unwrap();
        assert_ne!(program.program.0.get(), 0);
        assert_eq!(program.loc_position, 0);
        assert_eq!(program.loc_tex_coord, 1);
        assert_eq!(program.textures.len(), 8);
        assert!(program.textures.iter().all(Option::is_some));
        assert_eq!(program.texture, program.textures[0]);
    }
}

mod draw_gl_fullscreen_pass {
    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, make_state, make_texture_target, snapshot,
    };
    use flight_render_gl::{
        GlBlendSignature, GlViewportRect, compile_gl_fullscreen_program, draw_gl_fullscreen_pass,
    };
    use glow::HasContext;
    use std::rc::Rc;

    #[test]
    fn binds_inputs_draws_and_restores_texture_units() {
        let mut state = make_state();
        let program = compile_gl_fullscreen_program(&state.gl, "void main(){}").unwrap();
        // SAFETY: texture allocation is backed by the deterministic mock.
        let inputs = unsafe {
            [
                state.gl.create_texture().unwrap(),
                state.gl.create_texture().unwrap(),
            ]
        };
        let target = make_texture_target(&state, 40.0, 20.0);
        let expected_gl = Rc::clone(&state.gl);
        let mut callback_invoked = false;
        clear_calls();
        draw_gl_fullscreen_pass(
            &mut state,
            &program,
            &inputs,
            Some(&target),
            |gl, observed_program| {
                assert_eq!(calls_named("draw_elements"), 0);
                assert!(std::ptr::eq(gl, Rc::as_ref(&expected_gl)));
                assert!(std::ptr::eq(observed_program, &program));
                callback_invoked = true;
            },
        )
        .unwrap();
        assert!(callback_invoked);
        assert_eq!(calls_named("draw_elements"), 1);
        assert_eq!(
            calls_with("bind_framebuffer")[0].integers,
            vec![
                i64::from(glow::FRAMEBUFFER),
                i64::from(target.framebuffer.0.get())
            ]
        );
        assert_eq!(calls_with("viewport")[0].integers, vec![0, 0, 40, 20]);
        assert_eq!(
            state.gl_runtime.borrow().render_target_viewport,
            Some(GlViewportRect {
                x: 0,
                y: 0,
                width: 40,
                height: 20
            })
        );
        for (index, input) in inputs.iter().enumerate() {
            assert!(
                calls_with("active_texture")
                    .iter()
                    .any(|call| call.integers == vec![i64::from(glow::TEXTURE0) + index as i64])
            );
            assert!(
                calls_with("bind_texture").iter().any(|call| call.integers
                    == vec![i64::from(glow::TEXTURE_2D), i64::from(input.0.get())])
            );
        }
        assert_eq!(
            calls_with("bind_texture")
                .iter()
                .filter(|call| call.integers == vec![i64::from(glow::TEXTURE_2D), 0])
                .count(),
            inputs.len()
        );
        assert!(calls_named("active_texture") >= 3);
        assert_eq!(snapshot().active_texture, glow::TEXTURE0);
    }

    #[test]
    fn draws_with_depth_and_culling_off_and_blending_on_then_restores_the_caller() {
        for enabled in [false, true] {
            let mut state = make_state();
            let program = compile_gl_fullscreen_program(&state.gl, "void main(){}").unwrap();
            // SAFETY: the deterministic mock owns the caller's fixed-function state.
            unsafe {
                for capability in [glow::DEPTH_TEST, glow::CULL_FACE, glow::BLEND] {
                    if enabled {
                        state.gl.enable(capability)
                    } else {
                        state.gl.disable(capability)
                    }
                }
                state.gl.depth_mask(enabled);
            }
            clear_calls();
            draw_gl_fullscreen_pass(&mut state, &program, &[], None, |_, _| {}).unwrap();
            let observed = snapshot();
            assert_eq!(observed.draws.len(), 1);
            assert!(!observed.draws[0].depth_test);
            assert!(!observed.draws[0].depth_write);
            assert!(!observed.draws[0].cull_face);
            assert!(observed.draws[0].blend);
            for capability in [glow::DEPTH_TEST, glow::CULL_FACE, glow::BLEND] {
                assert_eq!(observed.enabled.contains(&capability), enabled);
            }
            assert_eq!(observed.depth_mask != 0, enabled);
        }
    }

    #[test]
    fn restores_normal_blending_after_the_uniform_callback_overrides_it() {
        let mut state = make_state();
        let program = compile_gl_fullscreen_program(&state.gl, "void main(){}").unwrap();
        clear_calls();
        draw_gl_fullscreen_pass(&mut state, &program, &[], None, |gl, _| {
            // SAFETY: callback mutations belong to the current mock context.
            unsafe { gl.blend_func(glow::ZERO, glow::ONE_MINUS_SRC_ALPHA) };
        })
        .unwrap();
        let blends = calls_with("blend_func");
        assert!(blends.iter().any(|call| call.integers
            == vec![i64::from(glow::ZERO), i64::from(glow::ONE_MINUS_SRC_ALPHA)]));
        assert_eq!(
            blends.last().unwrap().integers,
            vec![i64::from(glow::ONE), i64::from(glow::ONE_MINUS_SRC_ALPHA)]
        );
        assert_eq!(
            calls_with("blend_equation").last().unwrap().integers,
            vec![i64::from(glow::FUNC_ADD)]
        );
        assert_eq!(
            state
                .context_state
                .runtime_state
                .borrow()
                .current_blend_signature,
            Some(GlBlendSignature {
                dst: glow::ONE_MINUS_SRC_ALPHA,
                equation: glow::FUNC_ADD,
                src: glow::ONE
            })
        );
    }

    #[test]
    fn sets_and_caches_premultiplied_alpha_blending() {
        let mut state = make_state();
        let program = compile_gl_fullscreen_program(&state.gl, "void main(){}").unwrap();
        draw_gl_fullscreen_pass(&mut state, &program, &[], None, |_, _| {}).unwrap();
        // SAFETY: direct GL changes model a caller bypassing the cached blend signature.
        unsafe { state.gl.blend_func(glow::ZERO, glow::ONE_MINUS_SRC_ALPHA) };
        clear_calls();
        draw_gl_fullscreen_pass(&mut state, &program, &[], None, |_, _| {
            assert_eq!(snapshot().integers[&glow::BLEND_SRC_RGB], glow::ONE as i32);
            assert_eq!(
                snapshot().integers[&glow::BLEND_DST_RGB],
                glow::ONE_MINUS_SRC_ALPHA as i32
            );
        })
        .unwrap();
        assert_eq!(
            calls_with("blend_func").last().unwrap().integers,
            vec![i64::from(glow::ONE), i64::from(glow::ONE_MINUS_SRC_ALPHA)]
        );
        assert_eq!(
            calls_with("blend_equation").last().unwrap().integers,
            vec![i64::from(glow::FUNC_ADD)]
        );
        assert_eq!(
            state
                .context_state
                .runtime_state
                .borrow()
                .current_blend_signature,
            Some(GlBlendSignature {
                dst: glow::ONE_MINUS_SRC_ALPHA,
                equation: glow::FUNC_ADD,
                src: glow::ONE
            })
        );
    }

    #[test]
    fn targets_the_canvas_and_clears_the_tracked_target_viewport() {
        let mut state = make_state();
        let program = compile_gl_fullscreen_program(&state.gl, "void main(){}").unwrap();
        let target = make_texture_target(&state, 40.0, 20.0);
        draw_gl_fullscreen_pass(&mut state, &program, &[], Some(&target), |_, _| {}).unwrap();
        // SAFETY: the mock canvas viewport is the native surface-size seam.
        unsafe { state.gl.viewport(0, 0, 640, 480) };
        clear_calls();
        draw_gl_fullscreen_pass(&mut state, &program, &[], None, |_, _| {}).unwrap();
        assert_eq!(
            calls_with("bind_framebuffer")[0].integers,
            vec![i64::from(glow::FRAMEBUFFER), 0]
        );
        assert_eq!(calls_with("viewport")[0].integers, vec![0, 0, 640, 480]);
        assert_eq!(state.gl_runtime.borrow().render_target_viewport, None);
    }
}

mod fill_gl_rect {
    use crate::gl_test_helper::{calls_named, calls_with, clear_calls, make_state, snapshot};
    use flight_geometry::create_rectangle;
    use flight_render_gl::{begin_gl_render_pass, create_gl_screen_render_target, fill_gl_rect};
    use glow::HasContext;
    use std::rc::Rc;

    #[test]
    fn draws_with_blending_on_and_depth_off_then_restores_the_caller() {
        let mut state = make_state();
        let target = create_gl_screen_render_target(Rc::clone(&state.gl), 10, 10);
        let pass = begin_gl_render_pass(&state, &target, None, None).unwrap();
        // SAFETY: the deterministic mock owns the caller's capability state.
        unsafe {
            state.gl.enable(glow::DEPTH_TEST);
            state.gl.disable(glow::BLEND);
        }
        clear_calls();
        fill_gl_rect(&mut state, &pass, 0x000000ff, None).unwrap();
        let observed = snapshot();
        assert_eq!(observed.draws.len(), 1);
        assert!(observed.draws[0].blend);
        assert!(!observed.draws[0].depth_test);
        assert!(observed.enabled.contains(&glow::DEPTH_TEST));
        assert!(!observed.enabled.contains(&glow::BLEND));
    }

    #[test]
    fn fills_through_the_active_pass_and_optional_scissor() {
        let mut state = make_state();
        let target = create_gl_screen_render_target(Rc::clone(&state.gl), 10, 10);
        let pass = begin_gl_render_pass(&state, &target, None, None).unwrap();
        let rectangle = create_rectangle(10.0, 20.0, 30.0, 40.0);
        // SAFETY: the deterministic mock owns the caller's scissor state.
        unsafe { state.gl.disable(glow::SCISSOR_TEST) };
        clear_calls();
        fill_gl_rect(&mut state, &pass, 0xff8040ff, Some(&rectangle)).unwrap();
        assert_eq!(calls_named("uniform_4_f32"), 1);
        assert_eq!(
            calls_with("uniform_4_f32")[0].floats,
            vec![1.0, 128.0 / 255.0, 64.0 / 255.0, 1.0]
        );
        assert_eq!(calls_named("draw_elements"), 1);
        assert_eq!(calls_with("scissor")[0].integers, vec![10, 20, 30, 40]);
        let observed = snapshot();
        assert!(observed.draws[0].scissor_test);
        assert_eq!(observed.draws[0].scissor, [10, 20, 30, 40]);
        assert!(!observed.enabled.contains(&glow::SCISSOR_TEST));
    }
}
