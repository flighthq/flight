use flight_render_wgpu::*;
use flight_scene3d_wgpu::*;

use crate::support::*;

fn key() -> WgpuPbrDefineKey {
    return test_default();
}

fn record(_runtime: &mut WgpuRenderStateRuntime, _value: Option<&WgpuColorScaleBiasInput>, _index: u32) {}

fn resolve_flush(_state: &mut WgpuRenderState, _count: u32) -> Option<WgpuColorAdjustmentFlush> {
    return None;
}

static COLOR_FEATURE: WgpuColorAdjustmentMaterialFeature = WgpuColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "fn applyFlightColorAdjustment(c : vec4f, s : vec4f, b : vec4f) -> vec4f { return c * s + b; }\n",
    matrix_fragment_shader_chunk: "fn applyFlightColorMatrix(c : vec4f, a : vec4f, b : vec4f, d : vec4f, e : vec4f, o : vec4f) -> vec4f { return mat4x4f(a, b, d, e) * c + o; }\n",
    draw_shape_meshes: None,
    record,
    resolve_flush,
};

mod compile_wgpu_pbr_pipeline {
    use super::*;

    #[test]
    fn compiles_a_module_and_builds_the_pipeline_and_material_bind_group_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_pbr_pipeline(
            &mut test.state,
            &key(),
            wgpu::TextureFormat::Rgba16Float,
            None,
            None,
            None,
        );
        assert!(test.count("createShaderModule") > 0);
        assert!(test.count("createRenderPipeline") > 0);
        let layout = test
            .bind_group_layouts()
            .into_iter()
            .find(|layout| layout.layout == pipeline.material_bind_group_layout)
            .unwrap();
        assert_eq!(layout.entries.len(), 13);
    }

    #[test]
    fn bakes_back_face_culling_unless_the_key_is_double_sided() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_pbr_pipeline(&mut test.state, &key(), wgpu::TextureFormat::Bgra8Unorm, None, None, None);
        compile_wgpu_pbr_pipeline(
            &mut test.state,
            &WgpuPbrDefineKey {
                double_sided: true,
                ..key()
            },
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
            None,
        );
        let pipelines = test.pipelines();
        assert_eq!(pipelines[0].primitive.cull_mode, Some(wgpu::Face::Back));
        assert_eq!(pipelines[1].primitive.cull_mode, None);
    }

    // The promoted color-adjustment variants compile for real (the TS Draw struct omitted the
    // spliced fields, so these modules failed validation).
    #[test]
    fn compiles_the_promoted_color_adjustment_and_color_matrix_variants() {
        let mut test = make_wgpu_scene3d_state(None);
        compile_wgpu_pbr_pipeline(
            &mut test.state,
            &WgpuPbrDefineKey {
                has_color_adjustment: Some(true),
                ..key()
            },
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
            Some(&COLOR_FEATURE),
        );
        compile_wgpu_pbr_pipeline(
            &mut test.state,
            &WgpuPbrDefineKey {
                has_color_matrix: Some(true),
                ..key()
            },
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
            Some(&COLOR_FEATURE),
        );
        assert_eq!(test.count("createRenderPipeline"), 2);
    }

    #[test]
    fn compiles_the_skinned_variant_against_the_skin_draw_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_gpu_skinning(&mut test.state);
        compile_wgpu_pbr_pipeline(
            &mut test.state,
            &key(),
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            Some(true),
            None,
        );
        assert!(test.shader_sources()[0].contains("localPosition = skin * localPosition"));
    }
}

mod ensure_wgpu_pbr_pipeline {
    use super::*;

    #[test]
    fn caches_one_pipeline_per_define_key_and_format() {
        let mut test = make_wgpu_scene3d_state(None);
        let a = ensure_wgpu_pbr_pipeline(&mut test.state, &key(), wgpu::TextureFormat::Rgba16Float);
        let b = ensure_wgpu_pbr_pipeline(&mut test.state, &key(), wgpu::TextureFormat::Rgba16Float);
        assert_eq!(a.pipeline, b.pipeline);
        assert_eq!(get_wgpu_scene3d_runtime(&mut test.state).pipeline_cache.len(), 1);
    }

    #[test]
    fn compiles_distinct_variants_for_distinct_format_standard_or_extension_defines() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_pbr_pipeline(&mut test.state, &key(), wgpu::TextureFormat::Rgba16Float);
        ensure_wgpu_pbr_pipeline(&mut test.state, &key(), wgpu::TextureFormat::Bgra8Unorm);
        ensure_wgpu_pbr_pipeline(
            &mut test.state,
            &WgpuPbrDefineKey {
                double_sided: true,
                ..key()
            },
            wgpu::TextureFormat::Rgba16Float,
        );
        ensure_wgpu_pbr_pipeline(
            &mut test.state,
            &WgpuPbrDefineKey {
                clearcoat_enabled: true,
                ..key()
            },
            wgpu::TextureFormat::Rgba16Float,
        );
        assert_eq!(get_wgpu_scene3d_runtime(&mut test.state).pipeline_cache.len(), 4);
        let mut keys: Vec<String> = get_wgpu_scene3d_runtime(&mut test.state)
            .pipeline_cache
            .keys()
            .cloned()
            .collect();
        keys.sort();
        assert_eq!(keys[0], "pbr:bgra8unorm|--------:-------|opaque|rigid|direct");
    }
}
