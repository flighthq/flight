use flight_node::NodeRef;
use flight_render::BatchFormat;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

fn setup() -> WgpuRenderState {
    let mut state = create_test_state_in_pass();
    set_test_hosts(&mut state);
    let (rasterizer, _) = create_test_counting_rasterizer();
    register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
    register_wgpu_standard_material(&mut state);
    return state;
}

fn mesh_count(proxy: &flight_render::RenderProxy2D<WgpuRenderState>) -> Option<usize> {
    let data = proxy.renderer_data.clone().unwrap();
    let mut guard = data.write().unwrap();
    return get_wgpu_shape_data(&mut *guard)
        .unwrap()
        .meshes
        .as_ref()
        .map(|meshes| meshes.len());
}

fn writer_count(state: &WgpuRenderState) -> u32 {
    return get_wgpu_render_state_runtime(state).quad_batch_writer_count;
}

mod draw_wgpu_shape {
    use super::*;

    #[test]
    fn draws_a_solid_fill_and_open_solid_stroke_as_gpu_meshes_in_one_shape() {
        let mut state = setup();
        let shape = create_test_solid_shape();
        append_test_line_style(&shape, 4.0, 0xff0000ff);
        flight_shape::append_shape_move_to(&shape, 8.0, 4.0);
        flight_shape::append_shape_line_to(&shape, 40.0, 4.0);
        let node: NodeRef = shape;
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_shape(&mut state, &proxy);

        assert_eq!(mesh_count(&proxy), Some(2));
        assert_eq!(writer_count(&state), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn draws_a_closed_solid_stroke_ring_as_one_gpu_mesh() {
        let mut state = setup();
        enable_wgpu_stroke_path_tessellation(&mut state);
        let shape = create_test_shape();
        append_test_line_style(&shape, 8.0, 0xff0000ff);
        flight_shape::append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
        let node: NodeRef = shape;
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_shape(&mut state, &proxy);

        assert_eq!(mesh_count(&proxy), Some(1));
        assert_eq!(writer_count(&state), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn keeps_a_closed_stroke_on_the_raster_lane_until_stroke_path_tessellation_is_enabled() {
        let mut state = setup();
        let shape = create_test_shape();
        append_test_line_style(&shape, 8.0, 0xff0000ff);
        flight_shape::append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
        let node: NodeRef = shape;
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_shape(&mut state, &proxy);

        assert_eq!(mesh_count(&proxy), None);
        assert_eq!(writer_count(&state), 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn falls_back_to_the_raster_quad_for_a_self_intersecting_stroke_centerline() {
        let mut state = setup();
        let record = set_test_hosts(&mut state);
        enable_wgpu_stroke_path_tessellation(&mut state);
        let shape = create_test_shape();
        append_test_line_style(&shape, 8.0, 0xff0000ff);
        flight_shape::append_shape_path(
            &shape,
            &[1, 2, 2, 2, 7],
            &[8.0, 8.0, 40.0, 40.0, 8.0, 40.0, 40.0, 8.0],
            Some(flight_path::PathWinding::NonZero),
        );
        let node: NodeRef = shape.clone();
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_shape(&mut state, &proxy);
        let created = record.created_count();
        flight_node::invalidate_node_local_content(&node);
        draw_wgpu_shape(&mut state, &proxy);

        assert_eq!(mesh_count(&proxy), None);
        assert_eq!(writer_count(&state), 2);
        // A content change at the same size redraws into the existing surface, never reallocating it.
        assert_eq!(record.created_count(), created);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_commands_are_empty() {
        let mut state = setup();
        let node: NodeRef = create_test_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);
        draw_wgpu_shape(&mut state, &proxy);
        assert_eq!(writer_count(&state), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_renderer_data_is_none() {
        let mut state = setup();
        let node: NodeRef = create_test_solid_shape();
        let mut proxy = create_test_shape_proxy(&mut state, &node);
        proxy.renderer_data = None;
        draw_wgpu_shape(&mut state, &proxy);
        assert_eq!(writer_count(&state), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn does_not_panic_when_render_pass_is_none() {
        let mut state = create_wgpu_render_state_for_test(None);
        set_test_hosts(&mut state);
        let node: NodeRef = create_test_solid_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);
        draw_wgpu_shape(&mut state, &proxy);
        assert_eq!(writer_count(&state), 0);
    }

    #[test]
    fn writes_one_instance_to_the_quad_batch_writer_when_shape_has_valid_commands_and_bounds() {
        let mut state = setup();
        let node: NodeRef = create_test_gradient_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);
        draw_wgpu_shape(&mut state, &proxy);
        assert_eq!(writer_count(&state), 1);
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_shape_renderer {
    use super::*;

    #[test]
    fn provides_the_morph_shape_renderer_alias() {
        assert!(std::ptr::eq(
            WGPU_MORPH_SHAPE_RENDERER,
            &WGPU_SHAPE_RENDERER
        ));
    }

    #[test]
    fn declares_batch_format_quad() {
        assert_eq!(WGPU_SHAPE_RENDERER.format, Some(BatchFormat::Quad));
    }

    #[test]
    fn has_create_data_and_destroy_data_functions() {
        assert!(WGPU_SHAPE_RENDERER.destroy_data.is_some());
        assert!(std::ptr::fn_addr_eq(
            WGPU_SHAPE_RENDERER.submit,
            draw_wgpu_shape as fn(_, _)
        ));
    }
}
