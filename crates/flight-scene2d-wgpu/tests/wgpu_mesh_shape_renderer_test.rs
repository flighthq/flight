use flight_node::NodeRef;
use flight_render::{
    BatchFormat, RenderRegistriesMiss, RenderRegistryTable, enable_render_registries_guards,
    explain_render_registries_misses,
};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

fn mesh_count(proxy: &flight_render::RenderProxy2D<WgpuRenderState>) -> usize {
    let data = proxy.renderer_data.clone().unwrap();
    let mut guard = data.write().unwrap();
    return get_wgpu_shape_data(&mut *guard)
        .unwrap()
        .meshes
        .as_ref()
        .map(|meshes| meshes.len())
        .unwrap_or(0);
}

mod draw_wgpu_mesh_shape {
    use super::*;

    #[test]
    fn draws_a_solid_fill_as_a_gpu_mesh_and_reports_that_it_drew() {
        let mut state = create_test_state_in_pass();
        let node: NodeRef = create_test_solid_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);

        assert!(draw_wgpu_mesh_shape(&mut state, &proxy));
        assert_eq!(mesh_count(&proxy), 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn reports_false_for_a_fill_with_no_tessellated_form_which_is_the_hybrid_fall_through_signal() {
        let mut state = create_test_state_in_pass();
        let node: NodeRef = create_test_gradient_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);
        assert!(!draw_wgpu_mesh_shape(&mut state, &proxy));
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn reports_false_with_no_render_pass_an_empty_command_list_or_absent_renderer_data() {
        let mut state = create_wgpu_render_state_for_test(None);
        let node: NodeRef = create_test_solid_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);
        assert!(!draw_wgpu_mesh_shape(&mut state, &proxy));

        open_test_screen_pass(&mut state);
        let empty: NodeRef = create_test_shape();
        let empty_proxy = create_test_shape_proxy(&mut state, &empty);
        assert!(!draw_wgpu_mesh_shape(&mut state, &empty_proxy));
        let mut no_data = create_test_shape_proxy(&mut state, &node);
        no_data.renderer_data = None;
        assert!(!draw_wgpu_mesh_shape(&mut state, &no_data));
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_mesh_shape_renderer {
    use super::*;

    #[test]
    fn declares_batch_format_quad_and_the_shared_shape_data_lifecycle() {
        assert_eq!(WGPU_MESH_SHAPE_RENDERER.format, Some(BatchFormat::Quad));
        assert!(WGPU_MESH_SHAPE_RENDERER.destroy_data.is_some());
    }

    #[test]
    fn never_rasterizes_even_with_a_rasterizer_registered_and_a_fill_that_cannot_tessellate() {
        let mut state = create_test_state_in_pass();
        let (rasterizer, calls) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node: NodeRef = create_test_gradient_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);

        (WGPU_MESH_SHAPE_RENDERER.submit)(&mut state, &proxy);

        assert!(calls.lock().unwrap().is_empty());
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn reports_a_shape_rasterizer_miss_rather_than_silently_dropping_an_untessellatable_fill() {
        let mut state = create_test_state_in_pass();
        enable_render_registries_guards(&mut state, None);
        let node: NodeRef = create_test_gradient_shape();
        let proxy = create_test_shape_proxy(&mut state, &node);

        (WGPU_MESH_SHAPE_RENDERER.submit)(&mut state, &proxy);

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
}
