use flight_render::RenderState;
use flight_scene2d_wgpu::*;

use crate::support::*;

mod enable_wgpu_clip_support {
    use super::*;

    #[test]
    fn sets_the_display_object_clip_hooks() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(state.render_registries().clip_hooks.is_none());
        enable_wgpu_clip_support(&mut state);
        assert!(state.render_registries().clip_hooks.is_some());
    }
}
