use flight_color::{LinearColor, allocate_linear_color};
use flight_render_wgpu::*;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn make_key(lighting_model: WgpuClassicLightingModel) -> WgpuClassicDefineKey {
    return WgpuClassicDefineKey {
        alpha_mask_enabled: false,
        double_sided: false,
        has_color_adjustment: None,
        has_color_matrix: None,
        has_alpha_map: Some(false),
        has_diffuse_map: false,
        has_normal_map: false,
        has_specular_map: false,
        lighting_model,
    };
}

fn color(r: f32, g: f32, b: f32, a: f32) -> LinearColor {
    let mut out = allocate_linear_color();
    out.r = r;
    out.g = g;
    out.b = b;
    out.a = a;
    return out;
}

fn record_nothing(
    _runtime: &mut WgpuRenderStateRuntime,
    _value: Option<&WgpuColorScaleBiasInput>,
    _index: u32,
) {
}

fn resolve_nothing(_state: &mut WgpuRenderState, _count: u32) -> Option<WgpuColorAdjustmentFlush> {
    return None;
}

static COLOR_FEATURE: WgpuColorAdjustmentMaterialFeature = WgpuColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "fn applyFlightColorAdjustment(c : vec4f, m : vec4f, o : vec4f) -> vec4f { return c; }",
    matrix_fragment_shader_chunk: "fn applyFlightColorMatrix(c : vec4f, a : vec4f, b : vec4f, d : vec4f, e : vec4f, o : vec4f) -> vec4f { return c; }",
    draw_shape_meshes: None,
    record: record_nothing,
    resolve_flush: resolve_nothing,
};

mod bind_wgpu_classic_surface {
    use super::*;

    #[test]
    fn creates_a_material_bind_group_and_buffer_once_per_key_and_rewrites_the_uniform_each_call() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = ensure_wgpu_classic_pipeline(
            &mut test.state,
            &make_key(WgpuClassicLightingModel::Phong),
            wgpu::TextureFormat::Bgra8Unorm,
        );
        test.clear();
        let white = color(1.0, 1.0, 1.0, 1.0);
        bind_wgpu_classic_surface(
            &mut test.state,
            &pipeline,
            1,
            &color(1.0, 0.0, 0.0, 1.0),
            &white,
            32.0,
            0.5,
            None,
            None,
            None,
            None,
        );
        bind_wgpu_classic_surface(
            &mut test.state,
            &pipeline,
            1,
            &color(0.0, 1.0, 0.0, 1.0),
            &white,
            64.0,
            0.5,
            None,
            None,
            None,
            None,
        );

        // The first bind also uploads the shared 1x1 placeholder texture; the uniform writes are two.
        assert_eq!(test.count("createBindGroup"), 1);
        assert_eq!(test.count("writeBuffer"), 2);
        let last = bytes_to_f32(&test.buffer_writes()[1].data);
        assert_eq!(&last[..4], &[0.0, 1.0, 0.0, 1.0]);
        assert_eq!(last[8], 64.0);
    }

    #[test]
    fn exercises_the_real_sampler_path_with_a_non_null_primary_texture_and_builds_nothing_new_in_steady_state()
     {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = ensure_wgpu_classic_pipeline(
            &mut test.state,
            &make_key(WgpuClassicLightingModel::Phong),
            wgpu::TextureFormat::Bgra8Unorm,
        );
        let diffuse_map = create_test_bitmap_texture(1, 1);
        let red = color(1.0, 0.0, 0.0, 1.0);
        let white = color(1.0, 1.0, 1.0, 1.0);
        test.clear();
        bind_wgpu_classic_surface(
            &mut test.state,
            &pipeline,
            1,
            &red,
            &white,
            32.0,
            0.5,
            Some(&diffuse_map),
            None,
            None,
            None,
        );
        let samplers = test.count("createSampler");
        let bind_groups = test.count("createBindGroup");
        let buffers = test.count("createBuffer");
        assert!(samplers >= 1);

        bind_wgpu_classic_surface(
            &mut test.state,
            &pipeline,
            1,
            &red,
            &white,
            32.0,
            0.5,
            Some(&diffuse_map),
            None,
            None,
            None,
        );
        bind_wgpu_classic_surface(
            &mut test.state,
            &pipeline,
            1,
            &red,
            &white,
            32.0,
            0.5,
            Some(&diffuse_map),
            None,
            None,
            None,
        );
        assert_eq!(test.count("createSampler"), samplers);
        assert_eq!(test.count("createBindGroup"), bind_groups);
        assert_eq!(test.count("createBuffer"), buffers);
    }
}

mod build_wgpu_classic_define_key {
    use super::*;

    #[test]
    fn encodes_the_lighting_model_first_so_the_three_models_never_collide() {
        let lambert = build_wgpu_classic_define_key(&make_key(WgpuClassicLightingModel::Lambert));
        let phong = build_wgpu_classic_define_key(&make_key(WgpuClassicLightingModel::Phong));
        let blinn = build_wgpu_classic_define_key(&make_key(WgpuClassicLightingModel::BlinnPhong));
        assert!(lambert.starts_with('l'));
        assert!(phong.starts_with('p'));
        assert!(blinn.starts_with('b'));
        assert_ne!(lambert, phong);
        assert_ne!(phong, blinn);
        assert_ne!(lambert, blinn);
    }

    #[test]
    fn encodes_the_alpha_map_as_a_distinct_variant() {
        let mut with_alpha = make_key(WgpuClassicLightingModel::BlinnPhong);
        with_alpha.has_alpha_map = Some(true);
        assert_ne!(
            build_wgpu_classic_define_key(&with_alpha),
            build_wgpu_classic_define_key(&make_key(WgpuClassicLightingModel::BlinnPhong))
        );
    }

    #[test]
    fn keeps_the_base_key_stable_and_appends_color_adjustment_only_for_promotion() {
        let base = make_key(WgpuClassicLightingModel::Phong);
        let mut adjusted = base;
        adjusted.has_color_adjustment = Some(true);
        assert_eq!(
            build_wgpu_classic_define_key(&adjusted),
            format!("{}c", build_wgpu_classic_define_key(&base))
        );
    }
}

mod compile_wgpu_classic_pipeline {
    use super::*;

    #[test]
    fn builds_a_render_pipeline_with_a_material_bind_group_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = compile_wgpu_classic_pipeline(
            &mut test.state,
            &make_key(WgpuClassicLightingModel::Lambert),
            wgpu::TextureFormat::Bgra8Unorm,
            None,
            None,
            None,
        );
        assert!(pipeline.has_shadow_group);
        assert_eq!(test.count("createShaderModule"), 1);
        assert_eq!(test.count("createRenderPipeline"), 1);
        let layouts = test.bind_group_layouts();
        let material = layouts
            .iter()
            .find(|layout| layout.layout == pipeline.material_bind_group_layout)
            .unwrap();
        let bindings: Vec<u32> = material.entries.iter().map(|entry| entry.binding).collect();
        assert_eq!(bindings, vec![0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }
}

mod ensure_wgpu_classic_pipeline {
    use super::*;

    #[test]
    fn caches_under_the_classic_namespace_with_three_distinct_entries_for_the_three_models() {
        let mut test = make_wgpu_scene3d_state(None);
        let format = wgpu::TextureFormat::Bgra8Unorm;
        ensure_wgpu_classic_pipeline(
            &mut test.state,
            &make_key(WgpuClassicLightingModel::Lambert),
            format,
        );
        ensure_wgpu_classic_pipeline(
            &mut test.state,
            &make_key(WgpuClassicLightingModel::Phong),
            format,
        );
        ensure_wgpu_classic_pipeline(
            &mut test.state,
            &make_key(WgpuClassicLightingModel::BlinnPhong),
            format,
        );
        // Re-ensuring an existing model must not add a new cache entry.
        ensure_wgpu_classic_pipeline(
            &mut test.state,
            &make_key(WgpuClassicLightingModel::Phong),
            format,
        );

        let classic_keys = get_wgpu_scene3d_runtime(&mut test.state)
            .pipeline_cache
            .keys()
            .filter(|key| key.starts_with("classic:"))
            .count();
        assert_eq!(classic_keys, 3);
    }
}

mod get_wgpu_classic_module_source_for_key {
    use super::*;

    #[test]
    fn splices_the_registered_post_shade_chunk_only_into_the_promoted_variant() {
        let base = get_wgpu_classic_module_source_for_key(
            &make_key(WgpuClassicLightingModel::Phong),
            Some(false),
            None,
            Some(&COLOR_FEATURE),
        );
        let mut key = make_key(WgpuClassicLightingModel::Phong);
        key.has_color_adjustment = Some(true);
        let adjusted =
            get_wgpu_classic_module_source_for_key(&key, Some(false), None, Some(&COLOR_FEATURE));
        assert!(!base.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains("draw.flightColorScale"));
    }

    #[test]
    fn selects_a_distinct_full_matrix_post_shade_variant() {
        let mut key = make_key(WgpuClassicLightingModel::Phong);
        key.has_color_matrix = Some(true);
        let matrix =
            get_wgpu_classic_module_source_for_key(&key, Some(false), None, Some(&COLOR_FEATURE));
        assert_eq!(
            build_wgpu_classic_define_key(&key),
            format!(
                "{}x",
                build_wgpu_classic_define_key(&make_key(WgpuClassicLightingModel::Phong))
            )
        );
        assert!(matrix.contains(COLOR_FEATURE.matrix_fragment_shader_chunk));
        assert!(matrix.contains("draw.flightColorMatrix0"));
        assert!(!matrix.contains(COLOR_FEATURE.fragment_shader_chunk));
    }

    #[test]
    fn gates_the_alpha_map_const_and_coverage_multiply_off_the_alpha_map_flag() {
        let none = get_wgpu_classic_module_source_for_key(
            &make_key(WgpuClassicLightingModel::BlinnPhong),
            None,
            None,
            None,
        );
        assert!(none.contains("const HAS_ALPHA_MAP : bool = false;"));
        let mut key = make_key(WgpuClassicLightingModel::BlinnPhong);
        key.has_alpha_map = Some(true);
        let with_alpha = get_wgpu_classic_module_source_for_key(&key, None, None, None);
        assert!(with_alpha.contains("const HAS_ALPHA_MAP : bool = true;"));
        assert!(with_alpha.contains("alphaTexture"));
        assert!(with_alpha.contains("textureSample(alphaTexture, alphaSampler, in.uv).g"));
    }

    #[test]
    fn emits_the_lighting_model_const_matching_the_model_and_folds_the_others_off() {
        let phong = get_wgpu_classic_module_source_for_key(
            &make_key(WgpuClassicLightingModel::Phong),
            None,
            None,
            None,
        );
        assert!(phong.contains("const LIGHTING_PHONG : bool = true;"));
        assert!(phong.contains("const LIGHTING_BLINNPHONG : bool = false;"));

        let blinn = get_wgpu_classic_module_source_for_key(
            &make_key(WgpuClassicLightingModel::BlinnPhong),
            None,
            None,
            None,
        );
        assert!(blinn.contains("const LIGHTING_BLINNPHONG : bool = true;"));
        assert!(blinn.contains("const LIGHTING_PHONG : bool = false;"));

        let lambert = get_wgpu_classic_module_source_for_key(
            &make_key(WgpuClassicLightingModel::Lambert),
            None,
            None,
            None,
        );
        assert!(lambert.contains("const LIGHTING_PHONG : bool = false;"));
        assert!(lambert.contains("const LIGHTING_BLINNPHONG : bool = false;"));
    }

    #[test]
    fn emits_the_palette_and_skin_attributes_only_for_the_has_skin_variant() {
        let key = make_key(WgpuClassicLightingModel::BlinnPhong);
        assert!(
            !get_wgpu_classic_module_source_for_key(&key, None, None, None)
                .contains("jointTexture")
        );
        assert!(
            get_wgpu_classic_module_source_for_key(
                &key,
                Some(true),
                Some(make_wgpu_skinning_adapter()),
                None
            )
            .contains("@group(1) @binding(1) var jointTexture")
        );
    }

    #[test]
    fn declares_the_group_3_shadow_bindings_and_shadow_maps_the_directional_term() {
        let source = get_wgpu_classic_module_source_for_key(
            &make_key(WgpuClassicLightingModel::BlinnPhong),
            None,
            None,
            None,
        );
        assert!(source.contains("@group(3) @binding(0) var<uniform> shadow : Shadow;"));
        assert!(source.contains("@group(3) @binding(1) var shadowMap : texture_depth_2d;"));
        assert!(source.contains("@group(3) @binding(2) var shadowSampler : sampler_comparison;"));
        assert_eq!(
            source
                .matches("fn sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f)")
                .count(),
            1
        );
        // The whole directional contribution is scaled by the PCF factor; ambient stays unshadowed.
        assert_eq!(
            source
                .matches("direct * sampleDirectionalShadow(in.worldPosition, geometricNormal)")
                .count(),
            1
        );
    }

    #[test]
    fn consumes_every_packed_punctual_light_family_through_the_shared_classic_brdf() {
        let source = get_wgpu_classic_module_source_for_key(
            &make_key(WgpuClassicLightingModel::BlinnPhong),
            None,
            None,
            None,
        );
        assert!(source.contains("let pointCount = u32(frame.punctualCounts.x);"));
        assert!(source.contains("frame.pointLights[point * 2u + 1u].xyz * atten"));
        assert!(source.contains("let spotCount = u32(frame.punctualCounts.y);"));
        assert!(source.contains("frame.spotLights[spot * 4u + 1u].xyz * atten * cone"));
        assert!(source.contains("let hemisphereCount = u32(frame.punctualCounts.z);"));
        assert!(source.contains("frame.hemisphereLights[hemisphere * 3u + 1u].xyz"));
        assert_eq!(source.matches("shadeClassicLight(").count(), 4);
    }
}

mod get_wgpu_classic_shared_sampler_module_source_for_key {
    use super::*;

    #[test]
    fn retains_the_legacy_shared_sampler_binding_contract_for_shaded_composition() {
        let source = get_wgpu_classic_shared_sampler_module_source_for_key(
            &make_key(WgpuClassicLightingModel::BlinnPhong),
            None,
            None,
        );
        assert!(source.contains("@group(2) @binding(1) var materialSampler : sampler;"));
        assert!(source.contains("@group(2) @binding(2) var diffuseTexture : texture_2d<f32>;"));
        assert!(source.contains("@group(2) @binding(5) var alphaTexture : texture_2d<f32>;"));
        assert!(source.contains("textureSample(normalTexture, materialSampler, in.uv)"));
        assert!(!source.contains("diffuseSampler"));
    }
}
