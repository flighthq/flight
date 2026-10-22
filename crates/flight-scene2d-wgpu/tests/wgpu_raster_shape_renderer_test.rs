use flight_node::NodeRef;
use flight_render::{
    BatchFormat, RenderRegistriesMiss, RenderRegistryTable, enable_render_registries_guards,
    explain_render_registries_misses,
};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

fn writer_count(state: &WgpuRenderState) -> u32 {
    return get_wgpu_render_state_runtime(state).quad_batch_writer_count;
}

mod draw_wgpu_raster_shape {
    use super::*;

    #[test]
    fn rasterizes_a_fill_the_mesh_path_could_have_tessellated_which_is_what_pinning_this_strategy_means()
     {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let (rasterizer, calls) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node: NodeRef = create_test_solid_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_raster_shape(&mut state, &proxy);

        assert_eq!(calls.lock().unwrap().len(), 1);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .shape_mesh_pipelines
                .is_none()
        );
        assert_eq!(writer_count(&state), 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn replays_the_whole_command_stream_not_the_subset_a_mesh_path_could_not_express() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let (rasterizer, calls) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let shape = create_test_solid_shape();
        let node: NodeRef = shape.clone();
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_raster_shape(&mut state, &proxy);

        let replayed = calls.lock().unwrap()[0].clone();
        assert_eq!(
            format!("{replayed:?}"),
            format!("{:?}", shape.read().unwrap().data.commands)
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn reports_a_shape_rasterizer_miss_when_no_rasterizer_is_registered() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        enable_render_registries_guards(&mut state, None);
        let node: NodeRef = create_test_solid_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_raster_shape(&mut state, &proxy);

        assert!(
            explain_render_registries_misses(&state)
                .misses
                .contains(&RenderRegistriesMiss {
                    kind: "Shape".to_string(),
                    registry: RenderRegistryTable::ShapeRasterizer,
                })
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn preserves_expected_surface_absence_without_rasterizing_or_writing_a_batch() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        let (rasterizer, calls) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node: NodeRef = create_test_solid_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_raster_shape(&mut state, &proxy);

        assert!(calls.lock().unwrap().is_empty());
        assert_eq!(writer_count(&state), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn does_nothing_without_a_render_pass_for_an_empty_command_list_or_with_absent_renderer_data() {
        let mut state = create_wgpu_render_state_for_test(None);
        set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let (rasterizer, calls) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node: NodeRef = create_test_solid_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);

        draw_wgpu_raster_shape(&mut state, &proxy);
        open_test_screen_pass(&mut state);
        let empty: NodeRef = create_test_shape();
        let empty_proxy = create_test_shape_proxy(&mut state, &empty);
        draw_wgpu_raster_shape(&mut state, &empty_proxy);
        let mut no_data = create_test_shape_proxy(&mut state, &node);
        no_data.renderer_data = None;
        draw_wgpu_raster_shape(&mut state, &no_data);

        assert!(calls.lock().unwrap().is_empty());
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_raster_shape_renderer {
    use super::*;

    #[test]
    fn declares_batch_format_quad_and_the_shared_shape_data_lifecycle() {
        assert_eq!(WGPU_RASTER_SHAPE_RENDERER.format, Some(BatchFormat::Quad));
        assert!(WGPU_RASTER_SHAPE_RENDERER.destroy_data.is_some());
        assert!(std::ptr::fn_addr_eq(
            WGPU_RASTER_SHAPE_RENDERER.submit,
            draw_wgpu_raster_shape as fn(_, _)
        ));
    }
}
