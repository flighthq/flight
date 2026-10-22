use flight_scene3d_wgpu::contract::*;

use crate::support::*;

const DEPTH: WgpuDebugDefineKey = WgpuDebugDefineKey {
    has_normal_map: false,
    mode: WgpuDebugMode::Depth,
};
const NORMAL: WgpuDebugDefineKey = WgpuDebugDefineKey {
    has_normal_map: false,
    mode: WgpuDebugMode::Normal,
};
const NORMAL_MAP: WgpuDebugDefineKey = WgpuDebugDefineKey {
    has_normal_map: true,
    mode: WgpuDebugMode::Normal,
};

fn sorted_cache_keys(test: &mut WgpuScene3DTestState) -> Vec<String> {
    let mut keys: Vec<String> = get_wgpu_scene3d_runtime(&mut test.state)
        .pipeline_cache
        .keys()
        .cloned()
        .collect();
    keys.sort();
    return keys;
}

mod bind_wgpu_debug_surface {
    use super::*;

    #[test]
    fn creates_a_material_bind_group_once_per_key_and_writes_its_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_debug_pipeline(
            &mut test.state,
            &DEPTH,
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
            None,
        );
        bind_wgpu_debug_surface(&mut test.state, &pipeline, 1, 0.1, 100.0, 1.0);
        let groups = test.count("createBindGroup");
        bind_wgpu_debug_surface(&mut test.state, &pipeline, 1, 0.1, 100.0, 1.0);
        assert_eq!(test.count("createBindGroup"), groups);
        let write = test.buffer_writes().last().cloned().unwrap();
        assert_eq!(bytes_to_f32(&write.data), vec![0.1, 100.0, 1.0, 0.0]);
    }
}

mod build_wgpu_debug_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_mode_and_normal_map_flag() {
        assert_eq!(build_wgpu_debug_define_key(&DEPTH), "d-");
        assert_eq!(build_wgpu_debug_define_key(&NORMAL), "n-");
        assert_eq!(build_wgpu_debug_define_key(&NORMAL_MAP), "nm");
    }
}

mod compile_wgpu_debug_pipeline {
    use super::*;

    #[test]
    fn compiles_a_module_and_builds_the_pipeline_with_a_3_entry_material_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_debug_pipeline(
            &mut test.state,
            &NORMAL,
            wgpu::TextureFormat::Rgba16Float,
            None,
            None,
            None,
        );
        assert!(test.count("createShaderModule") > 0);
        assert_eq!(test.count("createRenderPipeline"), 1);
        assert!(
            test.bind_group_layouts()
                .iter()
                .any(|layout| layout.entries.len() == 3)
        );
    }

    #[test]
    fn disables_back_face_culling_for_a_double_sided_debug_material_variant() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_debug_pipeline(
            &mut test.state,
            &NORMAL,
            wgpu::TextureFormat::Rgba16Float,
            Some(false),
            Some(true),
            None,
        );
        assert_eq!(test.pipelines().last().unwrap().primitive.cull_mode, None);
    }
}

mod ensure_wgpu_debug_pipeline {
    use super::*;

    #[test]
    fn caches_variants_under_the_debug_namespace_with_distinct_depth_and_normal_entries() {
        let mut test = make_wgpu_scene3d_state(None);
        let format = wgpu::TextureFormat::Bgra8Unorm;
        let depth_first = ensure_wgpu_debug_pipeline(&mut test.state, &DEPTH, format, None);
        let depth_second = ensure_wgpu_debug_pipeline(&mut test.state, &DEPTH, format, None);
        assert_eq!(depth_second.pipeline, depth_first.pipeline);

        let normal = ensure_wgpu_debug_pipeline(&mut test.state, &NORMAL, format, None);
        assert_ne!(normal.pipeline, depth_first.pipeline);

        let keys = sorted_cache_keys(&mut test);
        assert!(keys.iter().any(|key| key.starts_with("debug:")));
        assert!(keys.contains(&"debug:bgra8unorm|d-|single|opaque|rigid|direct".to_string()));
        assert!(keys.contains(&"debug:bgra8unorm|n-|single|opaque|rigid|direct".to_string()));
    }

    #[test]
    fn caches_single_and_double_sided_variants_independently() {
        let mut test = make_wgpu_scene3d_state(None);
        let format = wgpu::TextureFormat::Bgra8Unorm;
        let single = ensure_wgpu_debug_pipeline(&mut test.state, &NORMAL, format, None);
        let double = ensure_wgpu_debug_pipeline(&mut test.state, &NORMAL, format, Some(true));
        assert_ne!(double.pipeline, single.pipeline);
        assert_eq!(
            sorted_cache_keys(&mut test),
            vec![
                "debug:bgra8unorm|n-|double|opaque|rigid|direct".to_string(),
                "debug:bgra8unorm|n-|single|opaque|rigid|direct".to_string(),
            ]
        );
    }
}

mod get_wgpu_debug_module_source_for_key {
    use super::*;

    #[test]
    fn emits_the_right_mode_const_and_includes_the_shared_prelude_and_fs_main() {
        let depth_source = get_wgpu_debug_module_source_for_key(&DEPTH, None, None);
        assert!(depth_source.contains("const MODE : i32 = DEPTH_MODE"));
        assert!(
            get_wgpu_debug_module_source_for_key(&NORMAL, None, None)
                .contains("const MODE : i32 = NORMAL_MODE")
        );
        assert!(depth_source.contains("const HAS_NORMAL_MAP : bool = false"));
        assert!(
            get_wgpu_debug_module_source_for_key(&NORMAL_MAP, None, None)
                .contains("const HAS_NORMAL_MAP : bool = true")
        );
        assert!(depth_source.contains("struct Frame"));
        assert!(depth_source.contains("fn fs_main"));
    }

    #[test]
    fn derives_depth_from_the_post_transform_world_position_for_orthographic_cameras() {
        let depth_source = get_wgpu_debug_module_source_for_key(&DEPTH, None, None);
        assert!(
            depth_source.contains("let eyeDepth = -(frame.view * vec4f(in.worldPosition, 1.0)).z;")
        );
        assert!(!depth_source.contains("1.0 / in.clipPosition.w"));
    }

    #[test]
    fn includes_skin_attribute_declarations_and_skin_matrix_when_skinned() {
        let rigid = get_wgpu_debug_module_source_for_key(&DEPTH, None, None);
        let skinned = get_wgpu_debug_module_source_for_key(
            &DEPTH,
            Some(true),
            Some(make_wgpu_skinning_adapter()),
        );
        assert!(!rigid.contains("skinMatrix"));
        assert!(skinned.contains("@location(4) joints0"));
        assert!(skinned.contains("@location(5) weights0"));
        assert!(skinned.contains("skinMatrix(joints0, weights0)"));
    }
}
