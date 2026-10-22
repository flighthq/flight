use flight_node::NodeRef;
use flight_render::{RenderProxies2D, prepare_scene_2d_render, register_node_renderer};
use flight_render_wgpu::*;
use flight_scene2d::{DISPLAY_OBJECT_KIND, SPRITE_KIND};
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

mod draw_wgpu_scene2d {
    use super::*;

    #[test]
    fn is_a_no_op_since_plain_display_objects_have_no_geometry() {
        let mut state = create_test_state_in_pass();
        let proxy = create_test_proxy(&mut state);
        let before = get_wgpu_render_state_runtime(&state).uniform_offset;
        draw_wgpu_scene2d(&mut state, &proxy);
        assert_eq!(get_wgpu_render_state_runtime(&state).uniform_offset, before);
        submit_wgpu_frame(&mut state);
    }
}

mod render_wgpu_scene2d {
    use super::*;

    #[test]
    fn traverses_a_display_object_without_error() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_node_renderer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            &WGPU_SCENE2D_RENDERER,
        );
        let mut proxies: RenderProxies2D<WgpuRenderState> = test_default();
        let root: NodeRef = flight_scene2d::create_display_object();
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);
        assert!(proxies.temp_stack.is_empty());
        submit_wgpu_frame(pass.state);
    }

    #[test]
    fn submits_children_in_paint_order_and_flushes_the_batch_at_the_end() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_standard_material(&mut state);
        register_node_renderer(
            &mut state,
            DISPLAY_OBJECT_KIND.to_string(),
            &WGPU_SCENE2D_RENDERER,
        );
        register_node_renderer(&mut state, SPRITE_KIND.to_string(), &WGPU_SPRITE_RENDERER);
        reset_wgpu_render_stats(&mut state);
        let mut proxies: RenderProxies2D<WgpuRenderState> = test_default();
        let root: NodeRef = flight_scene2d::create_display_object();
        let sprite = create_test_sprite(&mut state, 8, 8);
        let sprite_node: NodeRef = sprite;
        flight_node::add_node_child(&root, &sprite_node);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);

        render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);

        let state = pass.state;
        assert_eq!(
            get_wgpu_render_state_runtime(state).quad_batch_writer_count,
            0
        );
        let stats = get_wgpu_render_stats(state);
        assert_eq!(stats.batch_flush_count, 1);
        assert_eq!(stats.instance_count, 1);
        submit_wgpu_frame(state);
    }
}

mod wgpu_scene2d_renderer {
    use super::*;

    #[test]
    fn has_create_data_and_submit_functions() {
        assert!(WGPU_SCENE2D_RENDERER.format.is_none());
        assert!(std::ptr::fn_addr_eq(
            WGPU_SCENE2D_RENDERER.submit,
            draw_wgpu_scene2d as fn(_, _)
        ));
    }
}
