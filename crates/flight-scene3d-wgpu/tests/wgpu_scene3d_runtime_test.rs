use flight_render_wgpu::*;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

mod get_wgpu_scene3d_runtime {
    use super::*;

    #[test]
    fn lazily_creates_one_runtime_per_state_and_returns_the_same_instance() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = get_wgpu_scene3d_runtime(&mut test.state) as *const WgpuScene3DRuntime;
        let b = get_wgpu_scene3d_runtime(&mut test.state) as *const WgpuScene3DRuntime;
        assert_eq!(a, b);
        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        assert!(runtime.pipeline_cache.is_empty());
        assert!(runtime.active_blend_mode.is_none());
        assert!(runtime.active_mesh_pipeline.is_none());
    }

    #[test]
    fn surfaces_its_upload_cache_without_replacing_persistent_material_dispatch_policy() {
        let mut test = make_wgpu_scene3d_state(None);
        let materials = get_wgpu_render_state_runtime(&test.state)
            .registries
            .material_renderers
            .clone();
        let modifier_snippets = get_wgpu_render_state_runtime(&test.state)
            .registries
            .modifier_snippets
            .clone();
        let modifier_snippet_revision =
            get_wgpu_render_state_runtime(&test.state).modifier_snippet_revision;
        assert!(
            get_wgpu_render_state_runtime(&test.state)
                .context
                .read()
                .unwrap()
                .scene_mesh_upload_cache
                .is_none()
        );

        get_wgpu_scene3d_runtime(&mut test.state);

        let runtime = get_wgpu_render_state_runtime(&test.state);
        assert!(std::sync::Arc::ptr_eq(
            &runtime.registries.material_renderers,
            &materials
        ));
        assert!(std::sync::Arc::ptr_eq(
            &runtime.registries.modifier_snippets,
            &modifier_snippets
        ));
        assert_eq!(runtime.modifier_snippet_revision, modifier_snippet_revision);
        assert!(
            runtime
                .context
                .read()
                .unwrap()
                .scene_mesh_upload_cache
                .is_some()
        );
    }
}

mod get_wgpu_skinning_adapter {
    use super::*;

    #[test]
    fn returns_the_state_scoped_opt_in_adapter() {
        let mut test = make_wgpu_scene3d_state(None);
        assert!(get_wgpu_skinning_adapter(&mut test.state).is_none());
        register_wgpu_gpu_skinning(&mut test.state);
        assert!(get_wgpu_skinning_adapter(&mut test.state).is_some());
    }
}
