use flight_render_wgpu::*;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn key() -> WgpuPbrDefineKey {
    return test_default();
}

fn standard_all() -> WgpuPbrDefineKey {
    return WgpuPbrDefineKey {
        alpha_mask_enabled: true,
        double_sided: true,
        has_base_color_map: true,
        has_emissive_map: true,
        has_metallic_roughness_map: true,
        has_normal_map: true,
        has_occlusion_map: true,
        ..key()
    };
}

fn all() -> WgpuPbrDefineKey {
    return WgpuPbrDefineKey {
        anisotropy_enabled: true,
        clearcoat_enabled: true,
        iridescence_enabled: true,
        sheen_enabled: true,
        specular_enabled: true,
        subsurface_enabled: true,
        transmission_enabled: true,
        ..standard_all()
    };
}

fn record(
    _runtime: &mut WgpuRenderStateRuntime,
    _value: Option<&WgpuColorScaleBiasInput>,
    _index: u32,
) {
}

fn resolve_flush(_state: &mut WgpuRenderState, _count: u32) -> Option<WgpuColorAdjustmentFlush> {
    return None;
}

static COLOR_FEATURE: WgpuColorAdjustmentMaterialFeature = WgpuColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "fn applyFlightColorAdjustment(c : vec4f, m : vec4f, o : vec4f) -> vec4f { return c; }",
    matrix_fragment_shader_chunk: "fn applyFlightColorMatrix(c : vec4f, a : vec4f, b : vec4f, d : vec4f, e : vec4f, o : vec4f) -> vec4f { return c; }",
    draw_shape_meshes: None,
    record,
    resolve_flush,
};

mod build_wgpu_pbr_define_key {
    use super::*;

    #[test]
    fn produces_a_stable_distinct_string_per_flag_set() {
        assert_eq!(build_wgpu_pbr_define_key(&key()), "--------:-------");
        assert_eq!(
            build_wgpu_pbr_define_key(&standard_all()),
            "mdbnroe-:-------"
        );
        assert_eq!(build_wgpu_pbr_define_key(&all()), "mdbnroe-:CSAIPUT");
        let single = |key: WgpuPbrDefineKey| build_wgpu_pbr_define_key(&key);
        assert_eq!(
            single(WgpuPbrDefineKey {
                alpha_mask_enabled: true,
                ..key()
            }),
            "m-------:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                double_sided: true,
                ..key()
            }),
            "-d------:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                has_base_color_map: true,
                ..key()
            }),
            "--b-----:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                has_normal_map: true,
                ..key()
            }),
            "---n----:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                has_metallic_roughness_map: true,
                ..key()
            }),
            "----r---:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                has_occlusion_map: true,
                ..key()
            }),
            "-----o--:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                has_emissive_map: true,
                ..key()
            }),
            "------e-:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                has_alpha_map: true,
                ..key()
            }),
            "-------a:-------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                clearcoat_enabled: true,
                ..key()
            }),
            "--------:C------"
        );
        assert_eq!(
            single(WgpuPbrDefineKey {
                transmission_enabled: true,
                ..key()
            }),
            "--------:------T"
        );
    }

    #[test]
    fn is_identical_for_identical_flags_cache_soundness() {
        assert_eq!(
            build_wgpu_pbr_define_key(&all()),
            build_wgpu_pbr_define_key(&all())
        );
    }

    #[test]
    fn keeps_the_base_key_stable_and_appends_color_adjustment_only_for_promotion() {
        let adjusted = WgpuPbrDefineKey {
            has_color_adjustment: Some(true),
            ..key()
        };
        assert_eq!(
            build_wgpu_pbr_define_key(&adjusted),
            format!("{}c", build_wgpu_pbr_define_key(&key()))
        );
    }
}

mod build_wgpu_pbr_define_source {
    use super::*;

    #[test]
    fn emits_a_const_bool_flag_block_reflecting_the_key() {
        let source = build_wgpu_pbr_define_source(&WgpuPbrDefineKey {
            has_base_color_map: true,
            double_sided: true,
            ..key()
        });
        assert!(source.contains("const HAS_BASE_COLOR_MAP : bool = true;"));
        assert!(source.contains("const DOUBLE_SIDED : bool = true;"));
        assert!(source.contains("const ALPHA_MASK : bool = false;"));
        assert!(source.contains("const HAS_NORMAL_MAP : bool = false;"));
    }

    #[test]
    fn emits_a_const_for_every_extension_lobe() {
        let all = build_wgpu_pbr_define_source(&all());
        for flag in [
            "CLEARCOAT",
            "SHEEN",
            "ANISOTROPY",
            "IRIDESCENCE",
            "SPECULAR_EXT",
            "SUBSURFACE",
            "TRANSMISSION",
        ] {
            assert!(all.contains(&format!("const {} : bool = true;", flag)));
        }
        let none = build_wgpu_pbr_define_source(&key());
        assert!(none.contains("const CLEARCOAT : bool = false;"));
        assert!(none.contains("const TRANSMISSION : bool = false;"));
        assert!(none.contains("const HAS_ALPHA_MAP : bool = false;"));
    }

    #[test]
    fn gates_the_alpha_map_const_off_the_dedicated_coverage_map_flag() {
        let source = build_wgpu_pbr_define_source(&WgpuPbrDefineKey {
            has_alpha_map: true,
            ..key()
        });
        assert!(source.contains("const HAS_ALPHA_MAP : bool = true;"));
    }
}

mod get_wgpu_pbr_module_body {
    use super::*;

    #[test]
    fn declares_the_entry_points_and_bind_group_structs() {
        let body = get_wgpu_pbr_module_body();
        assert!(body.contains("fn vs_main"));
        assert!(body.contains("fn fs_main"));
        assert!(body.contains("struct Frame"));
        assert!(body.contains("struct MaterialBlock"));
        assert!(body.contains("var<uniform> frame"));
    }

    #[test]
    fn samples_every_standard_map_through_its_own_sampler_binding() {
        let body = get_wgpu_pbr_module_body();
        for (texture, sampler) in [
            ("baseColorTexture", "baseColorSampler"),
            ("metallicRoughnessTexture", "metallicRoughnessSampler"),
            ("normalTexture", "normalSampler"),
            ("occlusionTexture", "occlusionSampler"),
            ("emissiveTexture", "emissiveSampler"),
            ("alphaTexture", "alphaSampler"),
        ] {
            assert!(body.contains(&format!("textureSample({}, {}, in.uv)", texture, sampler)));
        }
    }

    #[test]
    fn includes_the_extension_lobe_helpers_behind_their_const_flags() {
        let body = get_wgpu_pbr_module_body();
        assert!(body.contains("distributionGgxAnisotropic"));
        assert!(body.contains("distributionCharlie"));
        assert!(body.contains("iridescentFresnel"));
        assert!(body.contains("if (CLEARCOAT)"));
        assert!(body.contains("if (TRANSMISSION)"));
    }

    // Image-based lighting shares group(3) with shadow so PBR stays within maxBindGroups 4.
    #[test]
    fn declares_the_group_3_ibl_bindings_and_applies_the_split_sum_ambient_term() {
        let body = get_wgpu_pbr_module_body();
        assert!(body.contains("@group(3) @binding(3) var<uniform> ibl"));
        assert!(body.contains("var iblIrradiance : texture_cube<f32>"));
        assert!(body.contains("var iblPrefiltered : texture_cube<f32>"));
        assert!(body.contains("var iblBrdf : texture_2d<f32>"));
        assert!(body.contains("fn sampleIblAmbient"));
        assert!(body.contains("fresnelSchlickRoughness"));
        assert!(body.contains("prefiltered * (F * brdf.x + brdf.y)"));
        assert!(body.contains("if (ibl.params.x > 0.5)"));
    }
}

mod get_wgpu_pbr_module_source_for_key {
    use super::*;

    #[test]
    fn splices_the_registered_post_shade_chunk_only_into_the_promoted_variant() {
        let base =
            get_wgpu_pbr_module_source_for_key(&key(), Some(false), None, Some(&COLOR_FEATURE));
        let adjusted = get_wgpu_pbr_module_source_for_key(
            &WgpuPbrDefineKey {
                has_color_adjustment: Some(true),
                ..key()
            },
            Some(false),
            None,
            Some(&COLOR_FEATURE),
        );
        assert!(!base.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains("draw.flightColorScale"));
    }

    #[test]
    fn splices_the_full_matrix_post_shade_chunk_into_its_own_variant() {
        let matrix = get_wgpu_pbr_module_source_for_key(
            &WgpuPbrDefineKey {
                has_color_matrix: Some(true),
                ..key()
            },
            Some(false),
            None,
            Some(&COLOR_FEATURE),
        );
        assert!(matrix.contains(COLOR_FEATURE.matrix_fragment_shader_chunk));
        assert!(matrix.contains("draw.flightColorMatrix0"));
    }

    #[test]
    fn prepends_the_flag_block_to_the_module_body() {
        let k = WgpuPbrDefineKey {
            has_normal_map: true,
            ..key()
        };
        let source = get_wgpu_pbr_module_source_for_key(&k, None, None, None);
        assert!(source.starts_with(&build_wgpu_pbr_define_source(&k)));
        assert!(source.contains("fn fs_main"));
        assert_eq!(
            source
                .matches("fn sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f)")
                .count(),
            1
        );
        assert!(source.contains("@interpolate(flat) objectAlpha : f32"));
        assert!(source.contains("flightMeshCoverage(alpha, in.objectAlpha, draw.params.y)"));
        assert!(!source.contains("jointTexture"));
        assert!(
            get_wgpu_pbr_module_source_for_key(
                &k,
                Some(true),
                Some(make_wgpu_skinning_adapter()),
                None
            )
            .contains("textureLoad(jointTexture")
        );
    }

    // TS bug: the PBR Draw struct lacked the splice anchor, so a promoted variant referenced
    // draw.flightColorScale without declaring it.
    #[test]
    fn declares_the_spliced_color_fields_in_the_pbr_draw_struct() {
        let adjusted = get_wgpu_pbr_module_source_for_key(
            &WgpuPbrDefineKey {
                has_color_adjustment: Some(true),
                ..key()
            },
            None,
            None,
            Some(&COLOR_FEATURE),
        );
        assert!(adjusted.contains("  flightColorScale : vec4f,"));
        let matrix = get_wgpu_pbr_module_source_for_key(
            &WgpuPbrDefineKey {
                has_color_matrix: Some(true),
                ..key()
            },
            None,
            None,
            Some(&COLOR_FEATURE),
        );
        assert!(matrix.contains("  flightColorMatrix0 : vec4f,"));
    }

    // TS bug: the PBR vertex stage did not match the skinning extension's splice anchor, so a skinned
    // PBR variant never applied the skin matrix and drew in its bind pose.
    #[test]
    fn applies_the_skin_matrix_in_the_skinned_variant() {
        let source = get_wgpu_pbr_module_source_for_key(
            &key(),
            Some(true),
            Some(make_wgpu_skinning_adapter()),
            None,
        );
        assert!(source.contains("localPosition = skin * localPosition"));
        assert!(source.contains("localNormal = skinNormalMatrix(joints0, weights0) * localNormal"));
    }
}
