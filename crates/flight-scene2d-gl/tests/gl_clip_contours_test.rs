use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, RwLock};

use flight_geometry::create_matrix;
use flight_path::PathWinding;
use flight_render::{RenderTargetDepth, create_render_cache};
use flight_render_gl::{begin_gl_render_pass, create_gl_texture_render_target, end_gl_render_pass};
use flight_scene2d_gl::*;
use glow::HasContext;

use crate::gl_test_helper::{
    calls_with, create_gl_state, display_node, last_call, make_proxies, make_target_descriptor,
};

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
    fn rejects_a_shared_context_cache_refresh_into_the_contour_target_before_it_can_clear_coverage()
    {
        let mut state = create_gl_state();
        let cache = Arc::new(RwLock::new(create_render_cache()));
        let mut cache_state = create_gl_cache_state(&state, None);
        let mut cache_proxies = make_proxies();
        let source = display_node();
        let target = ensure_gl_render_cache_target(&state, &cache.read().unwrap(), 1.0, 1.0);
        let pass = begin_gl_render_pass(&state, &*target.borrow(), None, None).unwrap();
        push_gl_clip_contours(&mut state, &square(), PathWinding::NonZero, &identity());
        // SAFETY: test GL call on the mock context's thread.
        unsafe { state.gl.depth_mask(false) };
        let stencil_clear_count = calls_with("clear").len();

        let result = catch_unwind(AssertUnwindSafe(|| {
            refresh_gl_render_cache(
                &state,
                &mut cache_state,
                &mut cache_proxies,
                &cache,
                &source,
                None,
            )
        }));

        let error = result.expect_err("refresh into the contour target must throw");
        let message = error
            .downcast_ref::<flight_entity::FlightError>()
            .map(|error| error.message.clone())
            .or_else(|| error.downcast_ref::<String>().cloned())
            .or_else(|| error.downcast_ref::<&str>().map(|value| value.to_string()))
            .unwrap_or_default();
        assert!(
            message.contains("cannot nest the active framebuffer while a contour clip is live"),
            "{message}"
        );
        assert_eq!(calls_with("clear").len(), stencil_clear_count);
        assert_eq!(state.gl_runtime.borrow().current_mask_depth, 1);
        end_gl_render_pass(&state, &pass).unwrap();
    }

    #[test]
    fn restores_the_outer_framebuffer_after_a_shared_context_cache_refresh_into_another_target() {
        let state = create_gl_state();
        let mut cache_state = create_gl_cache_state(&state, None);
        let mut cache_proxies = make_proxies();
        let mut descriptor = make_target_descriptor(64.0, 64.0);
        descriptor.depth = Some(RenderTargetDepth::DepthStencil);
        let outer = create_gl_texture_render_target(&state, &descriptor, None)
            .unwrap()
            .unwrap();
        let mut viewport = flight_node::create_viewport();
        viewport.device_pixel_ratio = 1.0;
        viewport.height = 16.0;
        viewport.width = 24.0;
        viewport.x = 4.0;
        viewport.y = 5.0;

        let pass = begin_gl_render_pass(&state, &outer, None, Some(&viewport)).unwrap();
        let outer_scissor = state.gl_runtime.borrow().current_scissor_rect;
        refresh_gl_render_cache(
            &state,
            &mut cache_state,
            &mut cache_proxies,
            &Arc::new(RwLock::new(create_render_cache())),
            &display_node(),
            None,
        );

        let framebuffer = i64::from(outer.framebuffer.0.get());
        assert_eq!(
            *last_call("bind_framebuffer").integers.last().unwrap(),
            framebuffer
        );
        assert_eq!(
            state.gl_runtime.borrow().current_framebuffer,
            Some(outer.framebuffer)
        );
        assert_eq!(
            state.gl_runtime.borrow().current_scissor_rect,
            outer_scissor
        );
        end_gl_render_pass(&state, &pass).unwrap();
    }

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
