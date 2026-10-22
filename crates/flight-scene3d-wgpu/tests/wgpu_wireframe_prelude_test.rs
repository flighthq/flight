use flight_color::{LinearColor, allocate_linear_color};
use flight_scene3d_wgpu::*;

use crate::support::*;

fn red() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 1.0;
    color.a = 1.0;
    return color;
}

fn sorted_cache_keys(test: &mut WgpuScene3DTestState) -> Vec<String> {
    let mut keys: Vec<String> = get_wgpu_scene3d_runtime(&mut test.state)
        .pipeline_cache
        .keys()
        .cloned()
        .collect();
    keys.sort();
    return keys;
}

mod bind_wgpu_wireframe_color {
    use super::*;

    #[test]
    fn creates_a_color_bind_group_once_per_key_and_writes_its_uniform() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_wireframe_pipeline(
            &mut test.state,
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
            None,
        );
        bind_wgpu_wireframe_color(&mut test.state, &pipeline, 1, &red(), None);
        let groups = test.count("createBindGroup");
        bind_wgpu_wireframe_color(&mut test.state, &pipeline, 1, &red(), None);
        assert_eq!(test.count("createBindGroup"), groups);
        let write = test.buffer_writes().last().cloned().unwrap();
        assert_eq!(
            bytes_to_f32(&write.data),
            vec![1.0, 0.0, 0.0, 1.0, 0.5, 0.0, 0.0, 0.0]
        );
    }
}

mod compile_wgpu_wireframe_pipeline {
    use super::*;

    #[test]
    fn builds_a_line_list_pipeline_with_a_single_uniform_material_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_wireframe_pipeline(
            &mut test.state,
            wgpu::TextureFormat::Rgba16Float,
            None,
            None,
            None,
        );
        let descriptor = test.pipelines()[0].clone();
        assert_eq!(
            descriptor.primitive.topology,
            wgpu::PrimitiveTopology::LineList
        );
        assert!(
            test.bind_group_layouts()
                .iter()
                .any(|layout| layout.entries.len() == 1)
        );
    }
}

mod ensure_wgpu_wireframe_pipeline {
    use super::*;

    #[test]
    fn caches_one_pipeline_per_format_under_the_wireframe_namespace() {
        let mut test = make_wgpu_scene3d_state(None);
        let a =
            ensure_wgpu_wireframe_pipeline(&mut test.state, wgpu::TextureFormat::Bgra8Unorm, None);
        let b =
            ensure_wgpu_wireframe_pipeline(&mut test.state, wgpu::TextureFormat::Bgra8Unorm, None);
        assert_eq!(a.pipeline, b.pipeline);
        assert!(
            sorted_cache_keys(&mut test)
                .iter()
                .any(|key| key.starts_with("wireframe:"))
        );
    }

    #[test]
    fn caches_base_and_alpha_mask_variants_independently() {
        let mut test = make_wgpu_scene3d_state(None);
        let base =
            ensure_wgpu_wireframe_pipeline(&mut test.state, wgpu::TextureFormat::Bgra8Unorm, None);
        let masked = ensure_wgpu_wireframe_pipeline(
            &mut test.state,
            wgpu::TextureFormat::Bgra8Unorm,
            Some(true),
        );
        assert_ne!(masked.pipeline, base.pipeline);
        assert_eq!(
            sorted_cache_keys(&mut test),
            vec![
                "wireframe:bgra8unorm|base|opaque|rigid|direct".to_string(),
                "wireframe:bgra8unorm|mask|opaque|rigid|direct".to_string(),
            ]
        );
    }
}

mod get_wgpu_wireframe_module_source {
    use super::*;

    #[test]
    fn includes_the_shared_prelude_and_a_fs_main_returning_the_color() {
        let source = get_wgpu_wireframe_module_source(None, None, None);
        assert!(source.contains("struct Frame"));
        assert!(source.contains("fn fs_main"));
        assert!(source.contains("material.color"));
    }

    #[test]
    fn emits_alpha_cutoff_discard_for_the_masked_variant() {
        let source = get_wgpu_wireframe_module_source(Some(true), None, None);
        assert!(source.contains("const ALPHA_MASK : bool = true"));
        assert!(source.contains("material.color.a < material.params.x"));
    }

    #[test]
    fn includes_skin_attribute_declarations_and_skin_matrix_when_skinned() {
        let rigid = get_wgpu_wireframe_module_source(None, None, None);
        let skinned = get_wgpu_wireframe_module_source(
            Some(false),
            Some(true),
            Some(make_wgpu_skinning_adapter()),
        );
        assert!(!rigid.contains("skinMatrix"));
        assert!(skinned.contains("@location(4) joints0"));
        assert!(skinned.contains("@location(5) weights0"));
        assert!(skinned.contains("skinMatrix(joints0, weights0)"));
    }
}
