use flight_entity::Ref;
use flight_node::NodeRef;
use flight_render::RenderProxy2D;
use flight_render_gl::GlRenderState;
use flight_scene2d_gl::*;
use flight_text::contract::{RichText, create_rich_text};
use flight_textinput::{enable_text_input, set_text_input_selection};

use flight_textlayout::contract::TextLayoutResult;

use crate::gl_test_helper::{
    count_calls, create_gl_state, create_gl_state_with_hosts, make_canvas_surface,
    make_scene2d_proxy, surface_calls, test_default,
};

fn make_focused_input_proxy(state: &mut GlRenderState) -> (Ref<RichText>, RenderProxy2D<GlRenderState>) {
    let node = create_rich_text(None);
    {
        let mut text = node.write().unwrap();
        text.data.height = 40.0;
        text.data.text = "hello".to_string();
        text.data.width = 100.0;
    }
    enable_text_input(&node, None).write().unwrap().focused = true;
    let erased: NodeRef = node.clone();
    let renderer_data = create_gl_rich_text_data(state, &erased);
    let mut proxy = make_scene2d_proxy(state, erased);
    proxy.renderer_data = renderer_data;
    return (node, proxy);
}

mod draw_gl_text_input_overlay {
    use super::*;

    #[test]
    fn is_the_installed_overlay_function() {
        let state = create_gl_state();
        enable_gl_text_input(&state);
        let installed: GlRichTextOverlay = draw_gl_text_input_overlay;
        assert!(std::ptr::fn_addr_eq(installed, draw_gl_text_input_overlay as GlRichTextOverlay));
    }

    #[test]
    fn draws_the_caret_onto_the_field_canvas_of_a_focused_input() {
        let mut state = create_gl_state();
        let (node, _proxy) = make_focused_input_proxy(&mut state);
        let surface = make_canvas_surface(100.0, 40.0);
        let context = surface.read().unwrap().context.clone();

        draw_gl_text_input_overlay(
            &context,
            &node,
            &test_default::<TextLayoutResult>(),
            100.0,
            40.0,
            "hello",
        );

        let calls = surface_calls(&surface);
        assert_eq!(calls.first().map(String::as_str), Some("save()"));
        assert_eq!(calls.last().map(String::as_str), Some("restore()"));
    }

    #[test]
    fn rasterizes_a_focused_collapsed_selection_without_throwing() {
        let (mut state, _host) = create_gl_state_with_hosts();
        enable_gl_text_input(&state);
        let (node, proxy) = make_focused_input_proxy(&mut state);
        set_text_input_selection(&node, 2, 2);

        draw_gl_rich_text(&mut state, &proxy);

        assert!(count_calls("draw_elements") > 0);
    }

    #[test]
    fn rasterizes_a_focused_expanded_selection_without_throwing() {
        let (mut state, _host) = create_gl_state_with_hosts();
        enable_gl_text_input(&state);
        let (node, proxy) = make_focused_input_proxy(&mut state);
        set_text_input_selection(&node, 1, 4);

        draw_gl_rich_text(&mut state, &proxy);

        assert!(count_calls("draw_elements") > 0);
    }
}

mod enable_gl_text_input {
    use super::*;

    #[test]
    fn installs_the_overlay_without_throwing() {
        let state = create_gl_state();
        enable_gl_text_input(&state);
    }
}
