use flight_scene3d_wgpu::*;

use crate::support::*;

const FLAT: WgpuToonDefineKey = WgpuToonDefineKey {
    alpha_mask_enabled: false,
    double_sided: false,
    has_base_color_map: false,
    has_ramp: false,
};
const COLOR: [f32; 4] = [0.5, 0.25, 0.1, 1.0];

mod bind_wgpu_toon_surface {
    use super::*;

    #[test]
    fn creates_a_material_bind_group_once_per_key_and_writes_its_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_toon_pipeline(
            &mut test.state,
            &FLAT,
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
        );
        bind_wgpu_toon_surface(&mut test.state, &pipeline, 1, &COLOR, 3.0, 0.5);
        let groups = test.count("createBindGroup");
        bind_wgpu_toon_surface(&mut test.state, &pipeline, 1, &COLOR, 3.0, 0.5);
        assert_eq!(test.count("createBindGroup"), groups);
        let write = test.buffer_writes().last().cloned().unwrap();
        assert_eq!(
            bytes_to_f32(&write.data),
            vec![0.5, 0.25, 0.1, 1.0, 3.0, 0.5, 0.0, 0.0]
        );
    }
}

mod build_wgpu_toon_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_flag_set() {
        assert_eq!(build_wgpu_toon_define_key(&FLAT), "----");
        assert_eq!(
            build_wgpu_toon_define_key(&WgpuToonDefineKey {
                alpha_mask_enabled: true,
                double_sided: true,
                has_base_color_map: true,
                has_ramp: true,
            }),
            "mdbr"
        );
    }
}

mod compile_wgpu_toon_pipeline {
    use super::*;

    #[test]
    fn compiles_a_module_and_builds_the_pipeline_with_a_4_entry_material_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_toon_pipeline(
            &mut test.state,
            &FLAT,
            wgpu::TextureFormat::Rgba16Float,
            None,
            None,
        );
        assert!(test.count("createShaderModule") > 0);
        assert_eq!(test.count("createRenderPipeline"), 1);
        assert!(
            test.bind_group_layouts()
                .iter()
                .any(|layout| layout.entries.len() == 4)
        );
    }

    #[test]
    fn compiles_a_cull_none_pipeline_for_a_double_sided_key() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_toon_pipeline(
            &mut test.state,
            &WgpuToonDefineKey {
                double_sided: true,
                ..FLAT
            },
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
        );
        assert_eq!(test.pipelines()[0].primitive.cull_mode, None);
    }
}

mod ensure_wgpu_toon_pipeline {
    use super::*;

    #[test]
    fn caches_one_pipeline_per_define_key_and_format_under_the_toon_namespace() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_toon_pipeline(&mut test.state, &FLAT, wgpu::TextureFormat::Bgra8Unorm);
        let b = ensure_wgpu_toon_pipeline(&mut test.state, &FLAT, wgpu::TextureFormat::Bgra8Unorm);
        assert_eq!(a.pipeline, b.pipeline);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .pipeline_cache
                .keys()
                .any(|key| key.starts_with("toon:"))
        );
    }
}

mod get_wgpu_toon_module_source_for_key {
    use super::*;

    #[test]
    fn emits_the_feature_consts_and_reads_the_shared_light_block() {
        assert!(
            get_wgpu_toon_module_source_for_key(&FLAT, None, None)
                .contains("const HAS_RAMP : bool = false")
        );
        assert!(
            get_wgpu_toon_module_source_for_key(
                &WgpuToonDefineKey {
                    alpha_mask_enabled: true,
                    ..FLAT
                },
                None,
                None
            )
            .contains("const ALPHA_MASK : bool = true")
        );
        let source = get_wgpu_toon_module_source_for_key(&FLAT, None, None);
        assert!(source.contains("struct Frame"));
        assert!(source.contains("frame.directionalRadiance"));
        assert!(source.contains("fn fs_main"));
        assert!(!source.contains("jointTexture"));
        assert!(
            get_wgpu_toon_module_source_for_key(
                &FLAT,
                Some(true),
                Some(make_wgpu_skinning_adapter())
            )
            .contains("@location(4) joints0")
        );
    }

    #[test]
    fn declares_the_group_3_shadow_bindings_and_shadow_maps_the_banded_directional_term() {
        for key in [
            FLAT,
            WgpuToonDefineKey {
                has_ramp: true,
                ..FLAT
            },
        ] {
            let source = get_wgpu_toon_module_source_for_key(&key, None, None);
            assert!(source.contains("@group(3) @binding(1) var shadowMap : texture_depth_2d;"));
            assert!(
                source.contains("@group(3) @binding(2) var shadowSampler : sampler_comparison;")
            );
            assert_eq!(
                source
                    .matches(
                        "fn sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f)"
                    )
                    .count(),
                1
            );
            assert_eq!(
                source
                    .matches("direct * sampleDirectionalShadow(in.worldPosition, normal)")
                    .count(),
                1
            );
        }
    }
}
