use flight_clip::{create_clip_region_from_contours, create_clip_region_from_rectangle, create_clip_region_state};
use flight_geometry::create_rectangle;
use flight_node::NodeRef;
use flight_path::PathWinding;
use flight_render::RenderProxy2D;
use flight_render_gl::{GlClipForm, GlRenderState};
use flight_scene2d_gl::*;

use crate::gl_test_helper::{calls_with, create_gl_state, last_call, make_scene2d_proxy};

fn make_source(contour: bool) -> NodeRef {
    let object = flight_scene2d::create_display_object();
    let clip = if contour {
        create_clip_region_from_contours(
            &create_clip_region_state(),
            &[vec![0.0, 0.0, 50.0, 0.0, 50.0, 50.0, 0.0, 50.0]],
            PathWinding::NonZero,
        )
    } else {
        create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 50.0, 50.0))
    };
    object.write().unwrap().clip = Some(clip);
    return object;
}

fn make_proxy(
    state: &mut GlRenderState,
    source: &NodeRef,
    clip_depth: u32,
) -> RenderProxy2D<GlRenderState> {
    let mut proxy = make_scene2d_proxy(state, source.clone());
    proxy.clip_depth = clip_depth;
    return proxy;
}

fn push(state: &mut GlRenderState, source: &NodeRef, depth: u32) {
    let proxy = make_proxy(state, source, depth);
    let hooks = state.registries.clip_hooks.unwrap();
    (hooks.push_clip)(state, &proxy, source);
}

mod enable_gl_clip_support {
    use super::*;

    #[test]
    fn installs_the_clip_hooks_on_the_render_state() {
        let mut state = create_gl_state();

        enable_gl_clip_support(&mut state);

        assert!(state.registries.clip_hooks.is_some());
    }

    #[test]
    fn push_clip_enables_the_scissor_test_for_a_rectangle_clip() {
        let mut state = create_gl_state();
        enable_gl_clip_support(&mut state);
        let source = make_source(false);

        push(&mut state, &source, 1);

        assert_eq!(last_call("enable").integers, vec![i64::from(glow::SCISSOR_TEST)]);
        assert_eq!(state.gl_runtime.borrow().clip_forms, vec![GlClipForm::Rect]);
    }

    #[test]
    fn push_clip_enables_the_stencil_test_for_a_contour_clip() {
        let mut state = create_gl_state();
        enable_gl_clip_support(&mut state);
        let source = make_source(true);

        push(&mut state, &source, 1);

        assert!(
            calls_with("enable")
                .iter()
                .any(|call| call.integers == vec![i64::from(glow::STENCIL_TEST)])
        );
        let runtime = state.gl_runtime.borrow();
        assert_eq!(runtime.clip_forms, vec![GlClipForm::Contour]);
        assert_eq!(runtime.current_mask_depth, 1);
    }

    #[test]
    fn push_clip_does_nothing_when_the_source_has_no_clip() {
        let mut state = create_gl_state();
        enable_gl_clip_support(&mut state);
        let source = crate::gl_test_helper::display_node();

        push(&mut state, &source, 0);

        assert!(state.gl_runtime.borrow().clip_forms.is_empty());
    }

    #[test]
    fn pop_clip_unwinds_forms_down_to_the_source_parent_depth() {
        let mut state = create_gl_state();
        enable_gl_clip_support(&mut state);
        let source = make_source(false);
        push(&mut state, &source, 1);

        let proxy = make_proxy(&mut state, &source, 1);
        let hooks = state.registries.clip_hooks.unwrap();
        (hooks.pop_clip)(&mut state, &proxy, &source);

        assert!(state.gl_runtime.borrow().clip_forms.is_empty());
    }

    #[test]
    fn finalize_pops_every_remaining_clip_form() {
        let mut state = create_gl_state();
        enable_gl_clip_support(&mut state);
        let rect_source = make_source(false);
        let contour_source = make_source(true);
        push(&mut state, &rect_source, 1);
        push(&mut state, &contour_source, 2);

        let hooks = state.registries.clip_hooks.unwrap();
        (hooks.finalize)(&mut state);

        assert!(state.gl_runtime.borrow().clip_forms.is_empty());
    }
}
