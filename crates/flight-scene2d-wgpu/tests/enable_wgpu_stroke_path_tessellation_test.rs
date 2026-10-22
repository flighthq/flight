use flight_render::RenderState;
use flight_scene2d_wgpu::*;

use crate::support::*;

mod enable_wgpu_stroke_path_tessellation {
    use super::*;

    #[test]
    fn replaces_the_full_stroke_tessellator_policy_slot() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(state.render_registries().stroke_tessellator.is_none());

        enable_wgpu_stroke_path_tessellation(&mut state);

        assert!(state.render_registries().stroke_tessellator.is_some());
    }
}
