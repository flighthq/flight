use flight_color::{LinearColor, allocate_linear_color};
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

const FLAT: WgpuMatcapDefineKey = WgpuMatcapDefineKey {
    alpha_mask_enabled: false,
    double_sided: false,
    has_matcap: false,
};

fn tint() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 0.5;
    color.g = 0.25;
    color.b = 0.1;
    color.a = 1.0;
    return color;
}

mod bind_wgpu_matcap_surface {
    use super::*;

    #[test]
    fn creates_a_material_bind_group_once_per_key_and_writes_its_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_matcap_pipeline(
            &mut test.state,
            &FLAT,
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
        );
        bind_wgpu_matcap_surface(&mut test.state, &pipeline, 1, &tint(), 0.5);
        let groups = test.count("createBindGroup");
        bind_wgpu_matcap_surface(&mut test.state, &pipeline, 1, &tint(), 0.5);
        assert_eq!(test.count("createBindGroup"), groups);
        let write = test.buffer_writes().last().cloned().unwrap();
        assert_eq!(
            bytes_to_f32(&write.data),
            vec![0.5, 0.25, 0.1, 1.0, 0.5, 0.0, 0.0, 0.0]
        );
    }
}

mod build_wgpu_matcap_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_flag_set() {
        assert_eq!(build_wgpu_matcap_define_key(&FLAT), "---");
        assert_eq!(
            build_wgpu_matcap_define_key(&WgpuMatcapDefineKey {
                alpha_mask_enabled: true,
                double_sided: true,
                has_matcap: true,
            }),
            "mdt"
        );
    }
}

mod compile_wgpu_matcap_pipeline {
    use super::*;

    #[test]
    fn compiles_a_module_and_builds_the_pipeline_with_a_3_entry_material_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_matcap_pipeline(
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

mod ensure_wgpu_matcap_pipeline {
    use super::*;

    #[test]
    fn caches_one_pipeline_per_define_key_and_format_under_the_matcap_namespace() {
        let mut test = make_wgpu_scene3d_state(None);
        let a =
            ensure_wgpu_matcap_pipeline(&mut test.state, &FLAT, wgpu::TextureFormat::Bgra8Unorm);
        let b =
            ensure_wgpu_matcap_pipeline(&mut test.state, &FLAT, wgpu::TextureFormat::Bgra8Unorm);
        assert_eq!(a.pipeline, b.pipeline);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .pipeline_cache
                .keys()
                .any(|key| key.starts_with("matcap:"))
        );
    }
}

mod get_wgpu_matcap_module_source_for_key {
    use super::*;

    #[test]
    fn emits_the_feature_consts_and_includes_the_shared_prelude_and_fs_main() {
        assert!(
            get_wgpu_matcap_module_source_for_key(&FLAT, None, None)
                .contains("const HAS_MATCAP : bool = false")
        );
        assert!(
            get_wgpu_matcap_module_source_for_key(
                &WgpuMatcapDefineKey {
                    alpha_mask_enabled: true,
                    ..FLAT
                },
                None,
                None
            )
            .contains("const ALPHA_MASK : bool = true")
        );
        let source = get_wgpu_matcap_module_source_for_key(&FLAT, None, None);
        assert!(source.contains("struct Frame"));
        assert!(source.contains("fn fs_main"));
    }

    #[test]
    fn includes_skin_attribute_declarations_and_skin_matrix_when_skinned() {
        let rigid = get_wgpu_matcap_module_source_for_key(&FLAT, None, None);
        let skinned = get_wgpu_matcap_module_source_for_key(
            &FLAT,
            Some(true),
            Some(make_wgpu_skinning_adapter()),
        );
        assert!(!rigid.contains("skinMatrix"));
        assert!(skinned.contains("@location(4) joints0"));
        assert!(skinned.contains("@location(5) weights0"));
        assert!(skinned.contains("skinMatrix(joints0, weights0)"));
    }
}
