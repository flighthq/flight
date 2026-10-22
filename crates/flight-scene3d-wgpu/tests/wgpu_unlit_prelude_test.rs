use flight_color::{LinearColor, allocate_linear_color};
use flight_render_wgpu::*;
use flight_scene3d_wgpu::*;

use crate::support::*;

const FLAT: WgpuUnlitDefineKey = WgpuUnlitDefineKey {
    alpha_mask_enabled: false,
    double_sided: false,
    has_color_map: false,
};

fn color() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 0.5;
    color.g = 0.25;
    color.b = 0.1;
    color.a = 1.0;
    return color;
}

mod bind_wgpu_unlit_surface {
    use super::*;

    #[test]
    fn creates_a_material_bind_group_once_per_key_and_writes_its_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_unlit_pipeline(
            &mut test.state,
            &FLAT,
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
        );
        bind_wgpu_unlit_surface(&mut test.state, &pipeline, 1, &color(), 2.0, 0.5, None);
        let groups = test.count("createBindGroup");
        bind_wgpu_unlit_surface(&mut test.state, &pipeline, 1, &color(), 2.0, 0.5, None);
        assert_eq!(test.count("createBindGroup"), groups);
        let write = test.buffer_writes().last().cloned().unwrap();
        assert_eq!(
            bytes_to_f32(&write.data),
            vec![0.5, 0.25, 0.1, 1.0, 2.0, 0.5, 0.0, 0.0]
        );
    }
}

mod bind_wgpu_unlit_video_surface {
    use super::*;

    #[test]
    fn uploads_the_ready_video_frame_into_the_same_unlit_material_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_unlit_pipeline(
            &mut test.state,
            &WgpuUnlitDefineKey {
                has_color_map: true,
                ..FLAT
            },
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
        );
        let (video, element) = create_test_video_texture(160, 120);
        register_wgpu_image_texture_resolver(&mut test.state);
        bind_wgpu_unlit_video_surface(&mut test.state, &pipeline, 1, &color(), 1.0, 0.5, &video);
        assert!(was_test_video_copied(&element));
        assert!(test.count("writeBuffer") > 0);
    }
}

mod build_wgpu_unlit_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_flag_set() {
        assert_eq!(build_wgpu_unlit_define_key(&FLAT), "---");
        assert_eq!(
            build_wgpu_unlit_define_key(&WgpuUnlitDefineKey {
                alpha_mask_enabled: true,
                double_sided: true,
                has_color_map: true,
            }),
            "mdc"
        );
    }
}

mod compile_wgpu_unlit_pipeline {
    use super::*;

    #[test]
    fn compiles_a_module_and_builds_the_pipeline_with_a_3_entry_material_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_unlit_pipeline(
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
                .any(|layout| layout.entries.len() == 3)
        );
    }
}

mod ensure_wgpu_unlit_pipeline {
    use super::*;

    #[test]
    fn caches_one_pipeline_per_define_key_and_format_under_the_unlit_namespace() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_unlit_pipeline(&mut test.state, &FLAT, wgpu::TextureFormat::Bgra8Unorm);
        let b = ensure_wgpu_unlit_pipeline(&mut test.state, &FLAT, wgpu::TextureFormat::Bgra8Unorm);
        assert_eq!(a.pipeline, b.pipeline);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .pipeline_cache
                .keys()
                .any(|key| key.starts_with("unlit:"))
        );
    }
}

mod get_wgpu_unlit_module_source_for_key {
    use super::*;

    #[test]
    fn emits_the_feature_consts_and_includes_the_shared_prelude_and_fs_main() {
        assert!(
            get_wgpu_unlit_module_source_for_key(&FLAT, None, None)
                .contains("const HAS_COLOR_MAP : bool = false")
        );
        assert!(
            get_wgpu_unlit_module_source_for_key(
                &WgpuUnlitDefineKey {
                    alpha_mask_enabled: true,
                    ..FLAT
                },
                None,
                None
            )
            .contains("const ALPHA_MASK : bool = true")
        );
        let source = get_wgpu_unlit_module_source_for_key(&FLAT, None, None);
        assert!(source.contains("struct Frame"));
        assert!(source.contains("fn fs_main"));
        assert!(!source.contains("jointTexture"));
        assert!(
            get_wgpu_unlit_module_source_for_key(
                &FLAT,
                Some(true),
                Some(make_wgpu_skinning_adapter())
            )
            .contains("@location(5) weights0")
        );
    }
}
