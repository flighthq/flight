use std::cell::RefCell;

use flight_node::{NodeRef, RendererDataRef, add_node_child};
use flight_render::{
    NodeRenderer, RenderProxies2D, RenderProxy2D, get_or_create_render_proxy_2d,
    prepare_scene_2d_render, register_node_renderer,
};
use flight_render_gl::{
    GlRenderPass, GlRenderState, acquire_gl_render_pass_handle, create_gl_screen_render_target,
};
use flight_scene2d::DISPLAY_OBJECT_KIND;
use flight_scene2d_gl::*;

use crate::gl_test_helper::{create_gl_state, display_node, make_proxies, snapshot};

thread_local! {
    static SUBMITTED: RefCell<Vec<u64>> = const { RefCell::new(Vec::new()) };
}

fn create_no_data(_state: &mut GlRenderState, _source: &NodeRef) -> Option<RendererDataRef> {
    return None;
}

fn record_submit(_state: &mut GlRenderState, proxy: &RenderProxy2D<GlRenderState>) {
    let id = flight_entity::get_entity_id(&*proxy.source.read().unwrap());
    SUBMITTED.with(|calls| calls.borrow_mut().push(id));
}

static RECORDING_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: None,
    create_data: create_no_data,
    destroy_data: None,
    is_dirty: None,
    submit: record_submit,
};

fn submitted() -> Vec<u64> {
    return SUBMITTED.with(|calls| calls.borrow().clone());
}

fn reset_submitted() {
    SUBMITTED.with(|calls| calls.borrow_mut().clear());
}

fn mock_pass(state: &GlRenderState) -> GlRenderPass {
    let target = create_gl_screen_render_target(std::rc::Rc::clone(&state.gl), 200, 100);
    return acquire_gl_render_pass_handle(state, &target);
}

fn render(state: &mut GlRenderState, proxies: &mut RenderProxies2D<GlRenderState>, node: &NodeRef) {
    let pass = mock_pass(state);
    render_gl_scene2d(state, proxies, &pass, node, None);
}

mod draw_gl_scene2d {
    use super::*;

    #[test]
    fn does_not_draw_plain_display_object_geometry() {
        let mut state = create_gl_state();
        let proxy = crate::gl_test_helper::make_scene2d_proxy(&mut state, display_node());
        draw_gl_scene2d(&mut state, &proxy);
    }

    #[test]
    fn scene2d_renderer_has_draw_and_create_data_functions() {
        let mut state = create_gl_state();
        assert!((GL_SCENE2D_RENDERER.create_data)(&mut state, &display_node()).is_none());
        assert!(std::ptr::fn_addr_eq(
            GL_SCENE2D_RENDERER.submit,
            draw_gl_scene2d as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }
}

mod render_gl_scene2d {
    use super::*;

    #[test]
    fn establishes_its_own_cull_depth_and_blend_state_rather_than_inheriting_it_from_a_previous_3d_pass()
     {
        let mut state = create_gl_state();
        let mut proxies = make_proxies();
        // SAFETY: test GL calls on the mock context's thread.
        unsafe {
            use glow::HasContext;
            state.gl.enable(glow::CULL_FACE);
            state.gl.enable(glow::DEPTH_TEST);
        }

        render(&mut state, &mut proxies, &display_node());

        let enabled = snapshot().enabled;
        assert!(!enabled.contains(&glow::CULL_FACE));
        assert!(!enabled.contains(&glow::DEPTH_TEST));
        assert!(enabled.contains(&glow::BLEND));
    }

    #[test]
    fn does_not_throw_for_an_empty_display_object() {
        let mut state = create_gl_state();
        let mut proxies = make_proxies();
        let node = display_node();
        prepare_scene_2d_render(&mut state, &mut proxies, &node);
        render(&mut state, &mut proxies, &node);
    }

    #[test]
    fn calls_renderer_submit_for_a_visible_object_with_a_renderer() {
        reset_submitted();
        let mut state = create_gl_state();
        let mut proxies = make_proxies();
        register_node_renderer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            &RECORDING_RENDERER,
        );
        let node = display_node();
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &node);
        prepare_scene_2d_render(&mut state, &mut proxies, &node);

        render(&mut state, &mut proxies, &node);

        assert_eq!(
            submitted(),
            vec![flight_entity::get_entity_id(&*node.read().unwrap())]
        );
    }

    #[test]
    fn skips_objects_with_zero_alpha() {
        reset_submitted();
        let mut state = create_gl_state();
        let mut proxies = make_proxies();
        register_node_renderer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            &RECORDING_RENDERER,
        );
        let object = flight_scene2d::create_display_object();
        object.write().unwrap().alpha = 0.0;
        let node: NodeRef = object;
        prepare_scene_2d_render(&mut state, &mut proxies, &node);

        render(&mut state, &mut proxies, &node);

        assert!(submitted().is_empty());
    }

    #[test]
    fn traverses_children_and_draws_visible_ones() {
        reset_submitted();
        let mut state = create_gl_state();
        let mut proxies = make_proxies();
        register_node_renderer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            &RECORDING_RENDERER,
        );
        let parent = display_node();
        let child = display_node();
        add_node_child(&parent, &child);
        prepare_scene_2d_render(&mut state, &mut proxies, &parent);

        render(&mut state, &mut proxies, &parent);

        assert_eq!(submitted().len(), 2);
    }
}
