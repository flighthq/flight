mod begin_gl_cube_render_face {
    use crate::gl_test_helper::{calls_with, clear_calls, make_state};
    use flight_render_gl::{
        begin_gl_cube_render_face, create_gl_cube_render_target,
        declare_gl_render_target_color_space, end_gl_cube_render_face, GlCubeRenderTargetOptions,
    };
    use flight_texture::RenderTargetColorSpace;

    #[test]
    fn binds_and_clears_the_selected_face() {
        let mut state = make_state();
        let mut target = create_gl_cube_render_target(&state, 32.0, None).unwrap();
        clear_calls();
        let pass = begin_gl_cube_render_face(&mut state, &target, 4).unwrap();
        assert!(declare_gl_render_target_color_space(
            &state,
            &mut target,
            RenderTargetColorSpace::Srgb,
        ));
        assert_eq!(target.color_space, RenderTargetColorSpace::Srgb);
        let attach = &calls_with("framebuffer_texture_2d")[0];
        assert_eq!(
            attach.integers,
            vec![
                i64::from(glow::FRAMEBUFFER),
                i64::from(glow::COLOR_ATTACHMENT0),
                i64::from(glow::TEXTURE_CUBE_MAP_POSITIVE_X + 4),
                i64::from(target.texture.0.get()),
                0,
            ]
        );
        assert_eq!(calls_with("viewport")[0].integers, vec![0, 0, 32, 32]);
        assert_eq!(calls_with("clear_buffer_f32")[0].floats, vec![0.0; 4]);
        let depth = &calls_with("clear_buffer_depth_stencil")[0];
        assert_eq!(depth.integers, vec![i64::from(glow::DEPTH_STENCIL), 0, 0]);
        assert_eq!(depth.floats, vec![1.0]);
        end_gl_cube_render_face(&state, &pass).unwrap();
    }

    #[test]
    fn rejects_a_face_outside_the_six_face_cube_range() {
        let mut state = make_state();
        let target = create_gl_cube_render_target(
            &state,
            4.0,
            Some(&GlCubeRenderTargetOptions { depth: Some(false) }),
        )
        .unwrap();
        assert_eq!(
            begin_gl_cube_render_face(&mut state, &target, 6)
                .err()
                .unwrap(),
            "beginGlCubeRenderFace face must be an integer from 0 through 5"
        );
    }
}
mod create_gl_cube_render_target {
    use crate::gl_test_helper::{calls_named, calls_with, clear_calls, make_state};
    use flight_render_gl::{create_gl_cube_render_target, GlCubeRenderTargetOptions};
    use glow::HasContext;

    #[test]
    fn allocates_six_rgba16f_faces_and_a_default_depth_attachment() {
        let state = make_state();
        clear_calls();
        let target = create_gl_cube_render_target(&state, 31.2, None).unwrap();
        assert_eq!(target.size, 32);
        assert_eq!(
            target.color_space,
            flight_texture::RenderTargetColorSpace::Linear
        );
        assert!(target.depth_stencil_renderbuffer.is_some());
        let faces = calls_with("tex_image_2d");
        assert_eq!(faces.len(), 6);
        for (face, call) in faces.iter().enumerate() {
            assert_eq!(
                call.integers,
                vec![
                    i64::from(glow::TEXTURE_CUBE_MAP_POSITIVE_X + face as u32),
                    0,
                    i64::from(glow::RGBA16F),
                    32,
                    32,
                    0,
                    i64::from(glow::RGBA),
                    i64::from(glow::HALF_FLOAT),
                    1,
                ]
            );
        }
        assert_eq!(
            calls_with("renderbuffer_storage")[0].integers,
            vec![
                i64::from(glow::RENDERBUFFER),
                i64::from(glow::DEPTH24_STENCIL8),
                32,
                32,
            ]
        );
        assert_eq!(calls_named("gen_framebuffers"), 1);
        assert_eq!(calls_named("gen_textures"), 1);
        assert_eq!(calls_named("gen_renderbuffers"), 1);
    }

    #[test]
    fn can_omit_depth_and_restores_creation_time_bindings() {
        let state = make_state();
        let previous_framebuffer = unsafe { state.gl.create_framebuffer() }.unwrap();
        let previous_renderbuffer = unsafe { state.gl.create_renderbuffer() }.unwrap();
        let previous_cube_texture = unsafe { state.gl.create_texture() }.unwrap();
        unsafe {
            state
                .gl
                .bind_framebuffer(glow::FRAMEBUFFER, Some(previous_framebuffer));
            state
                .gl
                .bind_renderbuffer(glow::RENDERBUFFER, Some(previous_renderbuffer));
            state
                .gl
                .bind_texture(glow::TEXTURE_CUBE_MAP, Some(previous_cube_texture));
        }
        clear_calls();
        let target = create_gl_cube_render_target(
            &state,
            0.0,
            Some(&GlCubeRenderTargetOptions { depth: Some(false) }),
        )
        .unwrap();
        assert_eq!(target.size, 1);
        assert!(target.depth_stencil_renderbuffer.is_none());
        assert_eq!(calls_named("gen_renderbuffers"), 0);
        assert_eq!(
            calls_with("bind_framebuffer").last().unwrap().integers,
            vec![
                i64::from(glow::FRAMEBUFFER),
                i64::from(previous_framebuffer.0.get()),
            ]
        );
        assert_eq!(
            calls_with("bind_renderbuffer").last().unwrap().integers,
            vec![
                i64::from(glow::RENDERBUFFER),
                i64::from(previous_renderbuffer.0.get()),
            ]
        );
        assert_eq!(
            calls_with("bind_texture").last().unwrap().integers,
            vec![
                i64::from(glow::TEXTURE_CUBE_MAP),
                i64::from(previous_cube_texture.0.get()),
            ]
        );
    }
}
mod destroy_gl_cube_render_target {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::{
        create_gl_cube_render_target, destroy_gl_cube_render_target, GlCubeRenderTargetOptions,
    };
    #[test]
    fn explicitly_deletes_owned_handles_once() {
        let state = make_state();
        let mut target = create_gl_cube_render_target(
            &state,
            2.0,
            Some(&GlCubeRenderTargetOptions { depth: Some(false) }),
        )
        .unwrap();
        destroy_gl_cube_render_target(&mut target);
        let calls = calls_named("delete_name");
        destroy_gl_cube_render_target(&mut target);
        assert_eq!(calls_named("delete_name"), calls);
    }
}
mod end_gl_cube_render_face {
    use crate::gl_test_helper::{clear_calls, make_state, snapshot};
    use flight_render_gl::{
        begin_gl_cube_render_face, create_gl_cube_render_target, end_gl_cube_render_face,
        GlCubeRenderTargetOptions,
    };
    use glow::HasContext;

    #[test]
    fn rejects_an_unmatched_end() {
        let mut state = make_state();
        let target = create_gl_cube_render_target(
            &state,
            4.0,
            Some(&GlCubeRenderTargetOptions { depth: Some(false) }),
        )
        .unwrap();
        let pass = begin_gl_cube_render_face(&mut state, &target, 0).unwrap();
        end_gl_cube_render_face(&state, &pass).unwrap();
        assert_eq!(
            end_gl_cube_render_face(&state, &pass).unwrap_err(),
            "endGlCubeRenderFace called without a matching beginGlCubeRenderFace"
        );
    }

    #[test]
    fn restores_physical_and_tracked_framebuffer_viewport_and_depth_state() {
        let mut state = make_state();
        let target = create_gl_cube_render_target(
            &state,
            4.0,
            Some(&GlCubeRenderTargetOptions { depth: Some(false) }),
        )
        .unwrap();
        let previous = unsafe { state.gl.create_framebuffer() }.unwrap();
        unsafe {
            state.gl.bind_framebuffer(glow::FRAMEBUFFER, Some(previous));
            state.gl.viewport(3, 4, 50, 60);
            state.gl.scissor(5, 6, 40, 30);
            state.gl.depth_mask(false);
            state.gl.enable(glow::SCISSOR_TEST);
        }
        state.gl_runtime.borrow_mut().current_framebuffer = Some(previous);
        state.gl_runtime.borrow_mut().render_target_viewport =
            Some(flight_render_gl::GlViewportRect {
                x: 3,
                y: 4,
                width: 50,
                height: 60,
            });
        clear_calls();
        let pass = begin_gl_cube_render_face(&mut state, &target, 0).unwrap();
        assert_eq!(
            state.gl_runtime.borrow().current_target.as_ref().unwrap().id,
            flight_entity::get_entity_id(&target)
        );
        end_gl_cube_render_face(&state, &pass).unwrap();
        assert!(state.gl_runtime.borrow().current_target.is_none());
        assert_eq!(
            state.gl_runtime.borrow().current_framebuffer,
            Some(previous)
        );
        assert_eq!(
            state.gl_runtime.borrow().render_target_viewport,
            Some(flight_render_gl::GlViewportRect {
                x: 3,
                y: 4,
                width: 50,
                height: 60,
            })
        );
        let physical = snapshot();
        assert_eq!(physical.framebuffer, previous.0.get() as i32);
        assert_eq!(physical.viewport, [3, 4, 50, 60]);
        assert_eq!(physical.scissor, [5, 6, 40, 30]);
        assert_eq!(physical.depth_mask, 0);
    }
}
mod initialize_gl_cube_render_target {
    use crate::gl_test_helper::{make_delete_queue, make_gl};
    use flight_render_gl::initialize_gl_cube_render_target;
    use glow::HasContext;
    use std::rc::Rc;
    #[test]
    fn retains_owned_handles_and_linear_color_space() {
        let gl = make_gl();
        let framebuffer = unsafe { gl.create_framebuffer() }.unwrap();
        let texture = unsafe { gl.create_texture() }.unwrap();
        let target = initialize_gl_cube_render_target(
            Rc::clone(&gl),
            16,
            framebuffer,
            texture,
            None,
            make_delete_queue(),
        );
        assert_eq!(target.size, 16);
        assert_eq!(target.texture, texture);
    }
}
