use std::rc::Rc;

use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{count_calls, make_gl_scene3d_state};

fn depth() -> GlDebugDefineKey {
    return GlDebugDefineKey {
        has_instances: None,
        has_normal_map: false,
        has_skin: None,
        mode: GlDebugMode::Depth,
    };
}

fn normal() -> GlDebugDefineKey {
    return GlDebugDefineKey {
        mode: GlDebugMode::Normal,
        ..depth()
    };
}

fn normal_map() -> GlDebugDefineKey {
    return GlDebugDefineKey {
        has_normal_map: true,
        mode: GlDebugMode::Normal,
        ..depth()
    };
}

mod bind_gl_debug_normal_map {
    use super::*;

    #[test]
    fn uploads_the_normal_scale_and_binds_no_texture_when_no_map_is_present() {
        let mut state = make_gl_scene3d_state();
        let program = compile_gl_debug_program(&state.gl.clone(), &normal(), None);
        bind_gl_debug_normal_map(&mut state, &program, None, 2.0);
        assert!(count_calls("uniform_1_f32") > 0);
        assert_eq!(count_calls("bind_texture"), 0);
    }
}

mod bind_gl_debug_range {
    use super::*;

    #[test]
    fn uploads_the_near_and_far_linearization_range() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_debug_program(&state.gl, &depth(), None);
        bind_gl_debug_range(&state, &program, 0.1, 100.0);
        assert!(count_calls("uniform_1_f32") >= 2);
    }
}

mod build_gl_debug_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_mode_and_normal_map_flag() {
        assert_eq!(build_gl_debug_define_key(&depth()), "d---");
        assert_eq!(build_gl_debug_define_key(&normal()), "n---");
        assert_eq!(build_gl_debug_define_key(&normal_map()), "nm--");
        assert_eq!(
            build_gl_debug_define_key(&GlDebugDefineKey {
                has_skin: Some(true),
                ..depth()
            }),
            "d-k-"
        );
    }
}

mod compile_gl_debug_program {
    use super::*;

    #[test]
    fn compiles_links_and_resolves_the_debug_uniforms_including_the_normal_matrix() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_debug_program(&state.gl, &normal(), None);
        assert!(program.loc_normal_matrix.is_some());
        assert!(program.loc_normal_scale.is_some());
        assert!(program.loc_view_projection.is_some());
        assert!(count_calls("link_program") > 0);
    }

    #[test]
    fn resolves_the_view_matrix_used_by_the_depth_variant() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_debug_program(&state.gl, &depth(), None);
        assert!(program.loc_view.is_some());
    }
}

mod ensure_gl_debug_program {
    use super::*;

    #[test]
    fn caches_variants_under_the_debug_namespace_with_distinct_depth_and_normal_entries() {
        let state = make_gl_scene3d_state();
        let depth_first = ensure_gl_debug_program(&state, &depth());
        let depth_second = ensure_gl_debug_program(&state, &depth());
        assert!(Rc::ptr_eq(&depth_second, &depth_first));

        let normal_program = ensure_gl_debug_program(&state, &normal());
        assert!(!Rc::ptr_eq(&normal_program, &depth_first));

        let keys: Vec<String> = get_gl_scene3d_runtime(&state).program_cache.keys().cloned().collect();
        assert!(keys.iter().any(|key| key.starts_with("debug:")));
        assert!(keys.contains(&"debug:d---".to_string()));
        assert!(keys.contains(&"debug:n---".to_string()));
        // The two distinct variants compiled exactly once each.
        assert_eq!(count_calls("link_program"), 2);
    }

    #[test]
    fn caches_rigid_and_skinned_variants_independently_from_the_active_draw_run() {
        let state = make_gl_scene3d_state();
        let rigid = ensure_gl_debug_program(&state, &depth());
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        let skinned = ensure_gl_debug_program(&state, &depth());

        assert!(!Rc::ptr_eq(&skinned, &rigid));
        let mut keys: Vec<String> = get_gl_scene3d_runtime(&state).program_cache.keys().cloned().collect();
        // D17: the Rust program cache is a HashMap; sort to compare against the TS insertion order.
        keys.sort();
        assert_eq!(keys, vec!["debug:d---".to_string(), "debug:d-k-".to_string()]);
    }
}

mod get_gl_debug_fragment_source_for_key {
    use super::*;

    #[test]
    fn gates_the_mode_and_normal_map_branches_by_define() {
        assert!(get_gl_debug_fragment_source_for_key(&depth()).contains("#define DEPTH_MODE"));
        assert!(!get_gl_debug_fragment_source_for_key(&depth()).contains("#define NORMAL_MODE"));
        assert!(get_gl_debug_fragment_source_for_key(&normal()).contains("#define NORMAL_MODE"));
        assert!(!get_gl_debug_fragment_source_for_key(&normal()).contains("#define HAS_NORMAL_MAP"));
        assert!(get_gl_debug_fragment_source_for_key(&normal_map()).contains("#define HAS_NORMAL_MAP"));
    }

    #[test]
    fn reads_projection_independent_view_depth_instead_of_reciprocal_clip_w() {
        let source = get_gl_debug_fragment_source_for_key(&depth());
        assert!(source.contains("v_viewDepth - u_near"));
        assert!(!source.contains("gl_FragCoord.w"));
    }
}

mod get_gl_debug_vertex_source_for_key {
    use super::*;

    #[test]
    fn carries_the_model_normal_and_view_projection_uniforms_for_both_modes() {
        let source = get_gl_debug_vertex_source_for_key(&normal(), None);
        assert!(source.contains("u_model"));
        assert!(source.contains("u_normalMatrix"));
        assert!(source.contains("u_viewProjection"));
        assert!(get_gl_debug_vertex_source_for_key(&depth(), None).contains("a_position"));
    }

    #[test]
    fn computes_positive_view_axis_depth_before_projection() {
        let source = get_gl_debug_vertex_source_for_key(&depth(), None);
        assert!(source.contains("uniform mat4 u_view"));
        assert!(source.contains("v_viewDepth = -(u_view * worldPosition).z"));
    }

    #[test]
    fn deforms_position_normal_and_tangent_only_in_the_skinned_variant() {
        let rigid = get_gl_debug_vertex_source_for_key(&normal(), None);
        let skinned = get_gl_debug_vertex_source_for_key(
            &GlDebugDefineKey {
                has_skin: Some(true),
                ..normal()
            },
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );

        assert!(!rigid.contains("#define HAS_SKIN"));
        assert!(!rigid.contains("skinMatrix() *"));
        assert!(skinned.contains("#define HAS_SKIN"));
        assert!(skinned.contains("uniform highp sampler2D u_jointTexture"));
        assert!(skinned.contains("mat4 skin = skinMatrix()"));
        assert!(skinned.contains("skinNormalMatrix() * a_normal"));
        assert!(skinned.contains("mat3(skin) * a_tangent.xyz"));
    }
}

mod tangent_frame_under_a_model_transform {
    use super::*;

    #[test]
    fn carries_the_tangent_through_the_model_matrix_and_the_mirror_through_its_handedness() {
        let vertex = get_gl_debug_vertex_source_for_key(&normal(), None);
        assert!(vertex.contains("mat3 modelRotation = mat3(u_model);"));
        assert!(vertex.contains("determinant(modelRotation) < 0.0 ? -1.0 : 1.0"));
        assert!(vertex.contains("v_tangent = vec4(modelRotation * localTangent, tangentHandedness);"));
        assert!(!vertex.contains("u_normalMatrix * a_tangent"));
        assert!(!vertex.contains("u_normalMatrix * localTangent"));
    }
}
