use flight_scene2d_wgpu::contract::*;

mod register_wgpu_shape_rasterizer {
    use super::*;

    #[test]
    fn is_exported_through_the_contract_lane() {
        let exported: fn(&mut WgpuRenderStateRef, Option<ShapeRasterizer<WgpuRenderStateRef>>) =
            register_wgpu_shape_rasterizer;
        let _ = exported;
    }
}

mod wgpu_shape_renderer {
    use super::*;

    #[test]
    fn is_a_node_renderer_with_a_submit_function() {
        assert!(std::ptr::fn_addr_eq(
            WGPU_SHAPE_RENDERER.submit,
            draw_wgpu_shape as fn(_, _)
        ));
    }
}

type WgpuRenderStateRef = flight_render_wgpu::WgpuRenderState;
