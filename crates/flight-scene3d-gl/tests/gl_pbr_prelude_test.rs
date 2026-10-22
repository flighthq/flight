use flight_render::RenderProxy2D;
use flight_render_gl::{
    GlColorAdjustmentData, GlColorAdjustmentMaterialFeature, GlPbrExtensionShaderContribution,
    GlRenderState, GlRenderStateRuntime, GlShapeMesh,
};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::test_default;

fn make_key() -> GlPbrDefineKey {
    return test_default::<GlPbrDefineKey>();
}

fn standard_all() -> GlPbrDefineKey {
    return GlPbrDefineKey {
        alpha_mask_enabled: true,
        has_base_color_map: true,
        has_emissive_map: true,
        has_metallic_roughness_map: true,
        has_normal_map: true,
        has_occlusion_map: true,
        ..make_key()
    };
}

fn no_draw_shape_meshes(
    _state: &mut GlRenderState,
    _proxy: &RenderProxy2D<GlRenderState>,
    _meshes: &[GlShapeMesh],
) {
}

fn no_flush(_state: &mut GlRenderState, _count: usize) -> bool {
    return false;
}

fn no_record(
    _runtime: &mut GlRenderStateRuntime,
    _data: Option<&GlColorAdjustmentData>,
    _index: usize,
) {
}

static COLOR_FEATURE: GlColorAdjustmentMaterialFeature = GlColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "vec4 applyFlightColorAdjustment(vec4 c, vec4 m, vec4 o) { return c * m + o; }",
    matrix_fragment_shader_chunk: "vec4 applyFlightColorMatrix(vec4 c, vec4 a, vec4 b, vec4 d, vec4 e, vec4 o) { return c; }",
    draw_shape_meshes: no_draw_shape_meshes,
    flush: no_flush,
    record: no_record,
};

mod build_gl_pbr_define_key {
    use super::*;

    #[test]
    fn produces_a_stable_distinct_string_per_flag_set() {
        assert_eq!(build_gl_pbr_define_key(&make_key()), "--------:--");
        assert_eq!(build_gl_pbr_define_key(&standard_all()), "mbnroe--:--");
        assert_eq!(build_gl_pbr_define_key(&standard_all()), "mbnroe--:--");
        let base_color = GlPbrDefineKey {
            has_base_color_map: true,
            ..make_key()
        };
        assert_eq!(build_gl_pbr_define_key(&base_color), "-b------:--");
        let alpha = GlPbrDefineKey {
            has_alpha_map: true,
            ..make_key()
        };
        assert_eq!(build_gl_pbr_define_key(&alpha), "------a-:--");
    }

    #[test]
    fn encodes_the_has_uv_transform_variant_as_a_distinct_standard_block_slot() {
        let key = GlPbrDefineKey {
            has_uv_transform: true,
            ..make_key()
        };
        assert_eq!(build_gl_pbr_define_key(&key), "-------u:--");
        assert_ne!(
            build_gl_pbr_define_key(&key),
            build_gl_pbr_define_key(&make_key())
        );
    }

    #[test]
    fn encodes_the_has_skin_variant_as_a_distinct_trailing_slot() {
        let key = GlPbrDefineKey {
            has_skin: Some(true),
            ..make_key()
        };
        assert_eq!(build_gl_pbr_define_key(&key), "--------:k-");
        assert_ne!(
            build_gl_pbr_define_key(&key),
            build_gl_pbr_define_key(&make_key())
        );
    }

    #[test]
    fn appends_color_adjustment_only_for_the_promoted_variant() {
        assert_eq!(build_gl_pbr_define_key(&make_key()), "--------:--");
        let key = GlPbrDefineKey {
            has_color_adjustment: Some(true),
            ..make_key()
        };
        assert_eq!(build_gl_pbr_define_key(&key), "--------:--c");
    }

    #[test]
    fn is_identical_for_equal_flag_sets() {
        assert_eq!(
            build_gl_pbr_define_key(&standard_all()),
            build_gl_pbr_define_key(&standard_all())
        );
    }
}

mod build_gl_pbr_define_source {
    use super::*;

    #[test]
    fn emits_a_define_for_each_enabled_flag_and_none_for_disabled_flags() {
        let all = build_gl_pbr_define_source(&standard_all());
        assert!(all.contains("#define ALPHA_MASK"));
        assert!(all.contains("#define HAS_BASE_COLOR_MAP"));
        assert!(all.contains("#define HAS_NORMAL_MAP"));
        assert!(all.contains("#define HAS_METALLIC_ROUGHNESS_MAP"));
        assert!(all.contains("#define HAS_OCCLUSION_MAP"));
        assert!(all.contains("#define HAS_EMISSIVE_MAP"));
        assert!(!all.contains("CLEARCOAT"));
        assert!(!all.contains("ANISOTROPY"));

        let none = build_gl_pbr_define_source(&make_key());
        assert!(!none.contains("#define ALPHA_MASK"));
        assert!(!none.contains("#define HAS_BASE_COLOR_MAP"));
        assert!(!none.contains("#define HAS_ALPHA_MAP"));
    }

    #[test]
    fn gates_the_has_alpha_map_define_off_the_dedicated_coverage_map_flag() {
        let key = GlPbrDefineKey {
            has_alpha_map: true,
            ..make_key()
        };
        assert!(build_gl_pbr_define_source(&key).contains("#define HAS_ALPHA_MAP"));
    }

    #[test]
    fn opens_with_the_glsl_300_es_version_directive() {
        assert!(build_gl_pbr_define_source(&make_key()).starts_with("#version 300 es"));
    }
}

mod get_gl_pbr_fragment_source {
    use super::*;

    #[test]
    fn declares_the_pbr_fragment_interface_and_outputs_linear_hdr_radiance() {
        let src = get_gl_pbr_fragment_source();
        assert!(src.contains("out vec4 fragColor"));
        assert!(src.contains("distributionGgx"));
        assert!(src.contains("fresnelSchlick"));
        assert!(src.contains("u_directionalRadiance"));
    }

    #[test]
    fn does_not_embed_a_version_directive_that_comes_from_the_define_block() {
        assert!(!get_gl_pbr_fragment_source().contains("#version"));
    }
}

mod get_gl_pbr_fragment_source_for_key {
    use super::*;

    #[test]
    fn splices_the_registered_post_shade_chunk_only_into_the_promoted_variant() {
        let base = get_gl_pbr_fragment_source_for_key(&make_key(), Some(&[]), Some(&COLOR_FEATURE));
        let key = GlPbrDefineKey {
            has_color_adjustment: Some(true),
            ..make_key()
        };
        let adjusted = get_gl_pbr_fragment_source_for_key(&key, Some(&[]), Some(&COLOR_FEATURE));
        assert!(!base.contains("vec4 applyFlightColorAdjustment"));
        assert!(adjusted.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains("fragColor = applyFlightColorAdjustment"));
    }

    #[test]
    fn splices_the_full_matrix_post_shade_chunk_into_its_own_variant() {
        let key = GlPbrDefineKey {
            has_color_matrix: Some(true),
            ..make_key()
        };
        let matrix = get_gl_pbr_fragment_source_for_key(&key, Some(&[]), Some(&COLOR_FEATURE));
        assert!(matrix.contains(COLOR_FEATURE.matrix_fragment_shader_chunk));
        assert!(matrix.contains("fragColor = applyFlightColorMatrix"));
    }

    #[test]
    fn prepends_the_define_block_to_the_fragment_body() {
        let src = get_gl_pbr_fragment_source_for_key(&standard_all(), None, None);
        assert!(src.starts_with("#version 300 es"));
        assert!(src.contains("#define HAS_NORMAL_MAP"));
        assert!(src.contains("out vec4 fragColor"));
        assert_eq!(
            src.matches("float sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal)")
                .count(),
            1
        );
    }

    #[test]
    fn emits_the_max_forward_lights_spec_constant_and_loops_the_punctual_light_arrays() {
        let src = get_gl_pbr_fragment_source_for_key(&make_key(), None, None);
        assert!(src.contains("#define MAX_FORWARD_LIGHTS"));
        assert!(src.contains("u_pointLights"));
        assert!(src.contains("u_spotLights"));
        assert!(src.contains("u_hemisphereLights"));
        // Directional, point, and spot lights share the one Cook-Torrance BRDF (no forked shading model).
        assert!(src.contains("shadePbrPunctual"));
    }

    #[test]
    fn declares_contributed_helpers_before_the_ibl_function_that_calls_them() {
        let contribution = GlPbrExtensionShaderContribution {
            apply_surface: String::new(),
            contribute_ibl: "  ambient += flightExtensionSample();".to_string(),
            contribute_punctual: String::new(),
            finalize: String::new(),
            fragment_declarations: String::new(),
            fragment_functions: "vec3 flightExtensionSample() { return vec3(0.0); }".to_string(),
            key: "ordering".to_string(),
            samples_transmission_scene_color: None,
            texture_count: 0,
        };
        let src = get_gl_pbr_fragment_source_for_key(&make_key(), Some(&[contribution]), None);

        assert!(
            src.find("vec3 flightExtensionSample()").unwrap()
                < src.find("vec3 sampleIblAmbient(").unwrap()
        );
    }
}

mod get_gl_pbr_vertex_source {
    use super::*;

    #[test]
    fn declares_the_canonical_pbr_vertex_attributes_and_model_view_projection_uniforms() {
        let src = get_gl_pbr_vertex_source();
        assert!(src.contains("layout(location = 0) in vec3 a_position"));
        assert!(src.contains("layout(location = 1) in vec3 a_normal"));
        assert!(src.contains("layout(location = 2) in vec4 a_tangent"));
        assert!(src.contains("layout(location = 3) in vec2 a_uv0"));
        assert!(src.contains("u_viewProjection"));
        assert!(src.contains("u_model"));
        assert!(src.contains("u_normalMatrix"));
    }
}

mod get_gl_pbr_vertex_source_for_key {
    use super::*;

    fn skinned_key() -> GlPbrDefineKey {
        return GlPbrDefineKey {
            has_skin: Some(true),
            ..make_key()
        };
    }

    #[test]
    fn injects_the_skin_declarations_and_has_skin_define_only_for_the_skinned_variant() {
        let rigid = get_gl_pbr_vertex_source_for_key(&make_key(), None);
        assert!(!rigid.contains("#define HAS_SKIN"));
        assert!(!rigid.contains("a_joints0"));
        assert!(!rigid.contains("mat4 skinMatrix()"));

        let skinned = get_gl_pbr_vertex_source_for_key(
            &skinned_key(),
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );
        assert!(skinned.contains("#define HAS_SKIN"));
        assert!(!skinned.contains("#define MAX_JOINTS"));
        assert!(skinned.contains("sampler2D u_jointTexture"));
        assert!(skinned.contains("texelFetch"));
        assert!(skinned.contains("mat4 skinMatrix()"));
        assert!(skinned.contains("a_joints0"));
    }

    // The no-influence fallback: with every weight zero the weighted sum is the ZERO matrix, so without
    // this guard the vertex lands on the origin with w = 0 and its normal is zero. A TEXT assertion
    // pinning that the guard is present in both skin functions.
    #[test]
    fn gives_both_skin_matrices_a_bind_pose_fallback_for_an_uninfluenced_vertex() {
        let skinned = get_gl_pbr_vertex_source_for_key(
            &skinned_key(),
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );

        let skin_body = &skinned[skinned.find("mat4 skinMatrix()").unwrap()..];
        assert!(skin_body.contains("return mat4(1.0);"));
        let normal_body = &skinned[skinned.find("mat3 skinNormalMatrix()").unwrap()..];
        assert!(normal_body.contains("return mat3(1.0);"));
    }

    #[test]
    fn prepends_the_define_block_to_the_vertex_body() {
        let src = get_gl_pbr_vertex_source_for_key(&make_key(), None);
        assert!(src.starts_with("#version 300 es"));
        assert!(src.contains("gl_Position"));
    }
}

mod tangent_frame_under_a_model_transform {
    use super::*;

    #[test]
    fn carries_the_tangent_through_the_model_matrix_and_the_mirror_through_its_handedness() {
        // A tangent is a true surface vector and follows the model matrix, a normal is a covector and
        // follows the inverse-transpose, and tangent.w is handedness that a mirroring transform reverses.
        let vertex = get_gl_pbr_vertex_source();
        assert!(vertex.contains("mat3 modelRotation = mat3(u_model);"));
        assert!(vertex.contains("determinant(modelRotation) < 0.0 ? -1.0 : 1.0"));
        assert!(
            vertex.contains("v_tangent = vec4(modelRotation * localTangent, tangentHandedness);")
        );
        assert!(vertex.contains("v_normal = u_normalMatrix * localNormal;"));
        assert!(!vertex.contains("u_normalMatrix * localTangent"));
    }
}
