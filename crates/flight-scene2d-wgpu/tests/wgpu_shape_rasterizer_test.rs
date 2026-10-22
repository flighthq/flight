use std::sync::Arc;

use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

fn noop_rasterizer() -> ShapeRasterizer<WgpuRenderState> {
    return Arc::new(|_context, _commands, _state| {});
}

mod get_wgpu_shape_rasterizer {
    use super::*;

    #[test]
    fn reports_none_until_one_is_registered() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_shape_rasterizer(&state).is_none());
    }
}

mod register_wgpu_shape_rasterizer {
    use super::*;

    #[test]
    fn installs_the_rasterizer_the_shape_path_draws_non_solid_fills_through() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rasterizer = noop_rasterizer();
        let before_empty = get_wgpu_render_state_runtime(&state)
            .registries
            .shape_rasterizer
            .is_none();

        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer.clone()));

        assert!(Arc::ptr_eq(
            &get_wgpu_shape_rasterizer(&state).unwrap(),
            &rasterizer
        ));
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .shape_rasterizer
                .is_some()
        );
        assert!(before_empty);
    }

    #[test]
    fn removes_one_again_so_a_state_can_drop_back_to_tessellation_only() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        let before_present = get_wgpu_render_state_runtime(&state)
            .registries
            .shape_rasterizer
            .is_some();

        register_wgpu_shape_rasterizer(&mut state, None);

        assert!(get_wgpu_shape_rasterizer(&state).is_none());
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .shape_rasterizer
                .is_none()
        );
        assert!(before_present);
    }
}
