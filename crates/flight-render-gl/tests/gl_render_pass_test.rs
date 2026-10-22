mod acquire_gl_render_pass_handle {
    use std::rc::Rc;

    use flight_render_gl::{
        acquire_gl_render_pass_handle, create_gl_screen_render_target,
        release_gl_render_pass_handle,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn reuses_a_released_handle_and_refreshes_its_target_snapshot() {
        let state = make_state();
        let first_target = create_gl_screen_render_target(Rc::clone(&state.gl), 10, 20);
        let pass = acquire_gl_render_pass_handle(&state, &first_target);
        let identity = Rc::as_ptr(&pass.0);
        release_gl_render_pass_handle(&state, pass);
        let second_target = create_gl_screen_render_target(Rc::clone(&state.gl), 30, 40);
        let reused = acquire_gl_render_pass_handle(&state, &second_target);
        assert_eq!(Rc::as_ptr(&reused.0), identity);
        assert_eq!(reused.0.borrow().target.width, 30);
        assert_eq!(reused.0.borrow().target.height, 40);
    }
}

mod begin_gl_render_pass {
    use std::rc::Rc;

    use flight_render_gl::{begin_gl_render_pass, create_gl_screen_render_target};

    use crate::gl_test_helper::{calls_named, make_state};

    #[test]
    fn binds_the_target_and_installs_the_current_pass() {
        let state = make_state();
        let target = create_gl_screen_render_target(Rc::clone(&state.gl), 320, 180);
        let pass = begin_gl_render_pass(&state, &target, None, None).unwrap();
        assert!(state.gl_runtime.borrow().current_pass == Some(pass));
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .render_target_viewport
                .unwrap()
                .width,
            320
        );
        assert_eq!(calls_named("bind_framebuffer"), 1);
        assert_eq!(calls_named("viewport"), 1);
    }
}

mod end_gl_render_pass {
    use std::rc::Rc;

    use flight_render_gl::{
        acquire_gl_render_pass_handle, begin_gl_render_pass, create_gl_screen_render_target,
        end_gl_render_pass,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn restores_the_previous_runtime_snapshot() {
        let state = make_state();
        let target = create_gl_screen_render_target(Rc::clone(&state.gl), 64, 32);
        let pass = begin_gl_render_pass(&state, &target, None, None).unwrap();
        end_gl_render_pass(&state, &pass).unwrap();
        assert!(state.gl_runtime.borrow().current_pass.is_none());
        assert!(state.gl_runtime.borrow().current_target.is_none());
    }

    #[test]
    fn rejects_a_handle_that_was_not_begun() {
        let state = make_state();
        let target = create_gl_screen_render_target(Rc::clone(&state.gl), 1, 1);
        let pass = acquire_gl_render_pass_handle(&state, &target);
        assert!(end_gl_render_pass(&state, &pass).is_err());
    }
}

mod get_gl_current_render_pass {
    use std::rc::Rc;

    use flight_render_gl::{
        begin_gl_render_pass, create_gl_screen_render_target, get_gl_current_render_pass,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn follows_the_runtime_current_pass_slot() {
        let state = make_state();
        assert!(get_gl_current_render_pass(&state).is_none());
        let target = create_gl_screen_render_target(Rc::clone(&state.gl), 2, 3);
        let pass = begin_gl_render_pass(&state, &target, None, None).unwrap();
        assert!(get_gl_current_render_pass(&state) == Some(pass));
    }
}

mod intersect_gl_rects {
    use flight_render_gl::{GlScissorRect, intersect_gl_rects};

    #[test]
    fn keeps_disjoint_rectangles_empty_at_the_intersection_edge() {
        let value = intersect_gl_rects(
            GlScissorRect {
                height: 10,
                width: 10,
                x: 0,
                y: 0,
            },
            GlScissorRect {
                height: 4,
                width: 5,
                x: 20,
                y: 30,
            },
        );
        assert_eq!(value.width, 0);
        assert_eq!(value.height, 0);
        assert_eq!(value.x, 20);
        assert_eq!(value.y, 30);
    }
}

mod release_gl_render_pass_handle {
    use std::rc::Rc;

    use flight_render_gl::{
        acquire_gl_render_pass_handle, create_gl_screen_render_target,
        release_gl_render_pass_handle,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn returns_the_handle_to_the_context_owned_pool() {
        let state = make_state();
        let target = create_gl_screen_render_target(Rc::clone(&state.gl), 1, 1);
        let first = acquire_gl_render_pass_handle(&state, &target);
        let identity = Rc::as_ptr(&first.0);
        release_gl_render_pass_handle(&state, first);
        let second = acquire_gl_render_pass_handle(&state, &target);
        assert_eq!(Rc::as_ptr(&second.0), identity);
    }
}

mod resolve_gl_pass_viewport {
    use flight_node::create_viewport;
    use flight_render_gl::{GlRenderTargetSnapshot, resolve_gl_pass_viewport};

    fn target() -> GlRenderTargetSnapshot {
        return GlRenderTargetSnapshot {
            color_attachments: 1,
            color_texture: None,
            framebuffer: None,
            height: 80,
            id: 1,
            resolve_framebuffer: None,
            sample_count: 1,
            width: 100,
        };
    }

    #[test]
    fn intersects_both_edges_before_clamping_a_negative_origin() {
        let mut viewport = create_viewport();
        viewport.x = -10.0;
        viewport.y = -5.0;
        viewport.width = 25.0;
        viewport.height = 20.0;
        assert_eq!(
            resolve_gl_pass_viewport(target(), Some(&viewport)),
            flight_render_gl::GlViewportRect {
                height: 15,
                width: 15,
                x: 0,
                y: 65,
            }
        );
    }

    #[test]
    fn keeps_a_fractional_origin_zero_area_viewport_empty() {
        let mut viewport = create_viewport();
        viewport.x = 10.5;
        viewport.y = 20.5;
        assert_eq!(
            resolve_gl_pass_viewport(target(), Some(&viewport)),
            flight_render_gl::GlViewportRect {
                height: 0,
                width: 0,
                x: 10,
                y: 60,
            }
        );
    }
}
