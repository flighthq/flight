use std::collections::HashSet;
use std::rc::Rc;

use flight_render::RenderProxy2D;
use flight_render_gl::{
    GlColorAdjustmentData, GlColorAdjustmentMaterialFeature, GlRenderState, GlRenderStateRuntime,
    GlShapeMesh,
};
use flight_scene3d_gl::*;

use crate::gl_test_helper::{calls_named, make_gl, make_gl_scene3d_state};

fn lambert() -> GlClassicDefineKey {
    return GlClassicDefineKey {
        alpha_mask_enabled: false,
        has_alpha_map: false,
        has_color_adjustment: None,
        has_color_matrix: None,
        has_diffuse_map: false,
        has_instances: None,
        has_normal_map: false,
        has_skin: None,
        has_specular_map: false,
        has_uv_transform: false,
        lighting_model: GlClassicLightingModel::Lambert,
    };
}

fn phong() -> GlClassicDefineKey {
    return GlClassicDefineKey {
        lighting_model: GlClassicLightingModel::Phong,
        ..lambert()
    };
}

fn blinn_phong() -> GlClassicDefineKey {
    return GlClassicDefineKey {
        lighting_model: GlClassicLightingModel::BlinnPhong,
        ..lambert()
    };
}

fn draw_no_meshes(
    _state: &mut GlRenderState,
    _proxy: &RenderProxy2D<GlRenderState>,
    _meshes: &[GlShapeMesh],
) {
}

fn flush_unhandled(_state: &mut GlRenderState, _count: usize) -> bool {
    return false;
}

fn record_nothing(
    _runtime: &mut GlRenderStateRuntime,
    _value: Option<&GlColorAdjustmentData>,
    _instance_index: usize,
) {
}

static COLOR_FEATURE: GlColorAdjustmentMaterialFeature = GlColorAdjustmentMaterialFeature {
    fragment_shader_chunk: "vec4 applyFlightColorAdjustment(vec4 c, vec4 m, vec4 o) { return c * m + o; }",
    matrix_fragment_shader_chunk:
        "vec4 applyFlightColorMatrix(vec4 c, vec4 a, vec4 b, vec4 d, vec4 e, vec4 o) { return c; }",
    draw_shape_meshes: draw_no_meshes,
    flush: flush_unhandled,
    record: record_nothing,
};

// SWAP-PENDING: replace with the crate's GL_SKIN_VERTEX_DECLARATIONS_GLSL once gl_mesh_skinning lands.
const GL_SKIN_VERTEX_DECLARATIONS_GLSL: &str = "
layout(location = 6) in vec4 a_joints0;
layout(location = 7) in vec4 a_weights0;
uniform highp sampler2D u_jointTexture;
mat4 skinMatrix() { return mat4(texelFetch(u_jointTexture, ivec2(0, 0), 0), vec4(0.0), vec4(0.0), vec4(0.0)); }
";

fn program_cache_keys(state: &GlRenderState) -> Vec<String> {
    return get_gl_scene3d_runtime(state).program_cache.keys().cloned().collect();
}

mod build_gl_classic_define_key {
    use super::*;

    #[test]
    fn encodes_the_lighting_model_first_then_the_feature_flags() {
        assert_eq!(build_gl_classic_define_key(&lambert()), "l--------");
        assert_eq!(build_gl_classic_define_key(&phong()), "p--------");
        assert_eq!(build_gl_classic_define_key(&blinn_phong()), "b--------");
        assert_eq!(
            build_gl_classic_define_key(&GlClassicDefineKey {
                alpha_mask_enabled: true,
                has_alpha_map: true,
                has_diffuse_map: true,
                has_normal_map: true,
                has_specular_map: true,
                has_uv_transform: true,
                lighting_model: GlClassicLightingModel::Phong,
                ..lambert()
            }),
            "pmdsnau--"
        );
    }

    #[test]
    fn encodes_a_non_identity_uv_transform_in_the_u_slot_ahead_of_skin() {
        let key = GlClassicDefineKey {
            has_uv_transform: true,
            ..lambert()
        };
        assert_eq!(build_gl_classic_define_key(&key), "l-----u--");
        assert_ne!(build_gl_classic_define_key(&key), build_gl_classic_define_key(&lambert()));
    }

    #[test]
    fn sets_the_trailing_skin_flag_so_a_skinned_variant_keys_distinctly() {
        let key = GlClassicDefineKey {
            has_skin: Some(true),
            ..lambert()
        };
        assert_eq!(build_gl_classic_define_key(&key), "l------k-");
        assert_ne!(build_gl_classic_define_key(&key), build_gl_classic_define_key(&lambert()));
    }

    #[test]
    fn keeps_the_base_identity_stable_and_appends_a_promoted_color_adjustment_marker() {
        assert_eq!(build_gl_classic_define_key(&lambert()), "l--------");
        assert_eq!(
            build_gl_classic_define_key(&GlClassicDefineKey {
                has_color_adjustment: Some(true),
                ..lambert()
            }),
            "l--------c"
        );
    }

    #[test]
    fn produces_distinct_strings_per_lighting_model_so_they_never_collide() {
        let keys: HashSet<String> = [
            build_gl_classic_define_key(&lambert()),
            build_gl_classic_define_key(&phong()),
            build_gl_classic_define_key(&blinn_phong()),
        ]
        .into_iter()
        .collect();
        assert_eq!(keys.len(), 3);
    }
}

mod compile_gl_classic_program {
    use super::*;

    #[test]
    fn compiles_links_and_resolves_the_classic_and_lit_uniform_locations() {
        let gl = make_gl();
        let program = compile_gl_classic_program(&gl, &phong(), None, None);
        assert!(program.loc_diffuse.is_some());
        assert!(program.loc_specular.is_some());
        assert!(program.loc_shininess.is_some());
        assert!(program.loc_normal_map.is_some());
        assert!(program.loc_normal_scale.is_some());
        assert!(program.loc_alpha_cutoff.is_some());
        // Composed from resolve_gl_lit_locations.
        assert!(program.loc_directional.is_some());
        assert!(program.loc_camera_position.is_some());
        assert!(calls_named("link_program") > 0);
    }
}

mod ensure_gl_classic_program {
    use super::*;

    #[test]
    fn caches_a_variant_under_the_classic_namespace_and_reuses_it() {
        let state = make_gl_scene3d_state();
        let first = ensure_gl_classic_program(&state, &lambert());
        let links = calls_named("link_program");
        let second = ensure_gl_classic_program(&state, &lambert());
        assert!(Rc::ptr_eq(&first, &second));
        assert_eq!(calls_named("link_program"), links);
        assert!(program_cache_keys(&state).iter().any(|key| key.starts_with("classic:")));
    }

    #[test]
    fn caches_a_distinct_entry_per_lighting_model() {
        let state = make_gl_scene3d_state();
        let lambert_program = ensure_gl_classic_program(&state, &lambert());
        let phong_program = ensure_gl_classic_program(&state, &phong());
        let blinn_phong_program = ensure_gl_classic_program(&state, &blinn_phong());
        assert!(!Rc::ptr_eq(&lambert_program, &phong_program));
        assert!(!Rc::ptr_eq(&phong_program, &blinn_phong_program));
        assert!(!Rc::ptr_eq(&lambert_program, &blinn_phong_program));
        assert_eq!(get_gl_scene3d_runtime(&state).program_cache.len(), 3);
    }

    #[test]
    fn folds_the_render_state_skinned_run_flag_into_a_distinct_has_skin_variant() {
        let state = make_gl_scene3d_state();
        let rigid = ensure_gl_classic_program(&state, &lambert());
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        let skinned = ensure_gl_classic_program(&state, &lambert());

        assert!(!Rc::ptr_eq(&skinned, &rigid));
        assert!(program_cache_keys(&state).contains(&"classic:l------k-".to_string()));
        assert!(matches!(skinned.loc_joint_texture.get(), Some(Some(_))));
    }
}

mod get_gl_classic_fragment_source {
    use super::*;

    #[test]
    fn returns_the_fragment_body_without_a_version_define_block() {
        let source = get_gl_classic_fragment_source();
        assert!(source.contains("fragColor"));
        assert!(!source.contains("#version 300 es"));
    }
}

mod get_gl_classic_fragment_source_for_key {
    use super::*;

    #[test]
    fn splices_the_registered_post_shade_chunk_only_into_the_presence_selected_variant() {
        let base = get_gl_classic_fragment_source_for_key(&lambert(), Some(&COLOR_FEATURE));
        let adjusted = get_gl_classic_fragment_source_for_key(
            &GlClassicDefineKey {
                has_color_adjustment: Some(true),
                ..lambert()
            },
            Some(&COLOR_FEATURE),
        );
        assert!(!base.contains("vec4 applyFlightColorAdjustment"));
        assert!(adjusted.contains(COLOR_FEATURE.fragment_shader_chunk));
        assert!(adjusted.contains("fragColor = applyFlightColorAdjustment"));
    }

    #[test]
    fn selects_a_distinct_full_matrix_post_shade_variant() {
        let key = GlClassicDefineKey {
            has_color_matrix: Some(true),
            ..lambert()
        };
        let matrix = get_gl_classic_fragment_source_for_key(&key, Some(&COLOR_FEATURE));
        assert_eq!(
            build_gl_classic_define_key(&key),
            format!("{}x", build_gl_classic_define_key(&lambert()))
        );
        assert!(matrix.contains(COLOR_FEATURE.matrix_fragment_shader_chunk));
        assert!(matrix.contains("fragColor = applyFlightColorMatrix"));
        assert!(!matrix.contains(COLOR_FEATURE.fragment_shader_chunk));
    }

    #[test]
    fn includes_the_lighting_model_and_feature_defines_only_when_set() {
        let source = |key: GlClassicDefineKey| -> String {
            return get_gl_classic_fragment_source_for_key(&key, None);
        };
        assert!(!source(lambert()).contains("#define LIGHTING_PHONG"));
        assert!(!source(lambert()).contains("#define LIGHTING_BLINNPHONG"));
        assert!(source(phong()).contains("#define LIGHTING_PHONG"));
        assert!(source(blinn_phong()).contains("#define LIGHTING_BLINNPHONG"));
        assert!(
            source(GlClassicDefineKey {
                has_diffuse_map: true,
                ..phong()
            })
            .contains("#define HAS_DIFFUSE_MAP")
        );
        assert!(
            source(GlClassicDefineKey {
                has_specular_map: true,
                ..phong()
            })
            .contains("#define HAS_SPECULAR_MAP")
        );
        assert!(
            source(GlClassicDefineKey {
                has_normal_map: true,
                ..phong()
            })
            .contains("#define HAS_NORMAL_MAP")
        );
        assert!(
            source(GlClassicDefineKey {
                has_alpha_map: true,
                ..phong()
            })
            .contains("#define HAS_ALPHA_MAP")
        );
        assert!(
            source(GlClassicDefineKey {
                alpha_mask_enabled: true,
                ..phong()
            })
            .contains("#define ALPHA_MASK")
        );
    }

    #[test]
    fn gates_the_alpha_map_define_off_the_key_and_always_carries_the_guarded_sampler_and_coverage_multiply() {
        // The define is what varies by key; the #ifdef-guarded sampler and multiply are unconditional raw
        // text (same as the normal/specular maps), compiled out unless HAS_ALPHA_MAP is defined.
        assert!(!get_gl_classic_fragment_source_for_key(&blinn_phong(), None).contains("#define HAS_ALPHA_MAP"));
        let with_alpha = get_gl_classic_fragment_source_for_key(
            &GlClassicDefineKey {
                has_alpha_map: true,
                ..blinn_phong()
            },
            None,
        );
        assert!(with_alpha.contains("#define HAS_ALPHA_MAP"));
        assert!(with_alpha.contains("uniform sampler2D u_alphaMap;"));
        assert!(with_alpha.contains("diffuse.a *= texture(u_alphaMap, v_uv0).g;"));
    }

    #[test]
    fn includes_the_standard_light_block_uniforms() {
        let source = get_gl_classic_fragment_source_for_key(&lambert(), None);
        assert!(source.contains("u_directionalRadiance"));
        assert!(source.contains("u_ambientRadiance"));
        assert!(source.contains("u_cameraPosition"));
    }

    #[test]
    fn shadow_maps_the_directional_term_and_only_the_directional_term() {
        let source = get_gl_classic_fragment_source_for_key(&lambert(), None);
        // The shared light block already declares the shadow uniforms + sampleDirectionalShadow; the classic
        // path multiplies its directional contribution by that factor, matching the PBR family.
        assert!(source.contains("sampleDirectionalShadow(v_worldPosition, geometricNormal)"));
        assert_eq!(
            source
                .matches("float sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal)")
                .count(),
            1
        );
        // Exactly one call — point/spot/ambient stay unshadowed, so the helper appears once in main().
        assert_eq!(
            source
                .matches("sampleDirectionalShadow(v_worldPosition, geometricNormal)")
                .count(),
            1
        );
    }

    #[test]
    fn uses_reflect_for_phong_and_the_half_vector_for_blinn_phong() {
        assert!(get_gl_classic_fragment_source_for_key(&phong(), None).contains("reflect("));
        assert!(
            get_gl_classic_fragment_source_for_key(&blinn_phong(), None)
                .contains("normalize(lightDir + viewDir)")
        );
    }

    #[test]
    fn emits_the_max_forward_lights_spec_constant_and_loops_the_punctual_light_arrays() {
        let source = get_gl_classic_fragment_source_for_key(&lambert(), None);
        assert!(source.contains("#define MAX_FORWARD_LIGHTS"));
        assert!(source.contains("u_pointLights"));
        assert!(source.contains("u_spotLights"));
        assert!(source.contains("u_hemisphereLights"));
        // Every light type routes through the one shared classic BRDF.
        assert!(source.contains("shadeClassicLight"));
    }
}

mod get_gl_classic_vertex_source {
    use super::*;

    #[test]
    fn returns_the_vertex_body_without_a_version_define_block() {
        let source = get_gl_classic_vertex_source();
        assert!(source.contains("a_position"));
        assert!(!source.contains("#version 300 es"));
    }
}

mod get_gl_classic_vertex_source_for_key {
    use super::*;

    #[test]
    fn passes_world_position_normal_tangent_and_uv_varyings() {
        let source = get_gl_classic_vertex_source_for_key(&lambert(), None);
        assert!(source.contains("v_worldPosition"));
        assert!(source.contains("v_normal"));
        assert!(source.contains("v_tangent"));
        assert!(source.contains("v_uv0"));
        assert!(source.contains("#version 300 es"));
    }

    #[test]
    fn injects_the_skin_declarations_and_has_skin_define_only_for_the_skinned_variant() {
        // The #ifdef HAS_SKIN guard lives in the body unconditionally; only the #define and the injected
        // attribute/uniform declarations are skin-specific.
        let rigid = get_gl_classic_vertex_source_for_key(&lambert(), None);
        assert!(!rigid.contains("#define HAS_SKIN"));
        assert!(!rigid.contains("a_joints0"));
        assert!(!rigid.contains("mat4 skinMatrix()"));

        let skinned = get_gl_classic_vertex_source_for_key(
            &GlClassicDefineKey {
                has_skin: Some(true),
                ..lambert()
            },
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );
        assert!(skinned.contains("#define HAS_SKIN"));
        assert!(!skinned.contains("#define MAX_JOINTS"));
        assert!(skinned.contains("sampler2D u_jointTexture"));
        assert!(skinned.contains("texelFetch"));
        assert!(skinned.contains("mat4 skinMatrix()"));
        assert!(skinned.contains("a_joints0"));
        assert!(skinned.contains("a_weights0"));
    }
}

mod tangent_frame_under_a_model_transform {
    use super::*;

    #[test]
    fn carries_the_tangent_through_the_model_matrix_and_the_mirror_through_its_handedness() {
        let vertex = get_gl_classic_vertex_source();
        assert!(vertex.contains("mat3 modelRotation = mat3(u_model);"));
        assert!(vertex.contains("determinant(modelRotation) < 0.0 ? -1.0 : 1.0"));
        assert!(vertex.contains("v_tangent = vec4(modelRotation * localTangent, tangentHandedness);"));
        assert!(vertex.contains("v_normal = u_normalMatrix * localNormal;"));
        assert!(!vertex.contains("u_normalMatrix * localTangent"));
    }
}
