use std::rc::Rc;

use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{calls_named, make_gl, make_gl_scene3d_state};

fn flat() -> GlToonDefineKey {
    return GlToonDefineKey {
        alpha_mask_enabled: false,
        has_base_color_map: false,
        has_instances: None,
        has_ramp: false,
        has_skin: None,
        has_uv_transform: false,
    };
}

mod build_gl_toon_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_flag_set() {
        assert_eq!(build_gl_toon_define_key(&flat()), "------");
        assert_eq!(
            build_gl_toon_define_key(&GlToonDefineKey {
                alpha_mask_enabled: true,
                has_base_color_map: true,
                has_ramp: true,
                has_uv_transform: true,
                ..flat()
            }),
            "mbru--"
        );
        assert_eq!(
            build_gl_toon_define_key(&GlToonDefineKey {
                has_ramp: true,
                ..flat()
            }),
            "--r---"
        );
    }

    #[test]
    fn encodes_a_non_identity_uv_transform_in_the_u_slot_ahead_of_skin() {
        let key = GlToonDefineKey {
            has_uv_transform: true,
            ..flat()
        };
        assert_eq!(build_gl_toon_define_key(&key), "---u--");
        assert_ne!(build_gl_toon_define_key(&key), build_gl_toon_define_key(&flat()));
    }

    #[test]
    fn appends_a_skinned_flag_that_differs_from_the_rigid_key() {
        let key = GlToonDefineKey {
            has_skin: Some(true),
            ..flat()
        };
        assert_eq!(build_gl_toon_define_key(&key), "----k-");
        assert_ne!(build_gl_toon_define_key(&key), build_gl_toon_define_key(&flat()));
    }
}

mod compile_gl_toon_program {
    use super::*;

    #[test]
    fn compiles_links_and_resolves_the_lit_and_toon_uniform_locations() {
        let gl = make_gl();
        let program = compile_gl_toon_program(&gl, &flat(), None);
        // Lit base locations (composed from resolve_gl_lit_locations).
        assert!(program.loc_directional.is_some());
        assert!(program.loc_ambient_radiance.is_some());
        assert!(program.loc_camera_position.is_some());
        // Toon material locations.
        assert!(program.loc_base_color.is_some());
        assert!(program.loc_steps.is_some());
        assert!(program.loc_ramp.is_some());
        assert!(program.loc_base_color_map.is_some());
        assert!(program.loc_alpha_cutoff.is_some());
        // Shared vertex transforms.
        assert!(program.loc_model.is_some());
        assert!(program.loc_normal_matrix.is_some());
        assert!(program.loc_view_projection.is_some());
        assert!(calls_named("link_program") > 0);
    }
}

mod ensure_gl_toon_program {
    use super::*;

    #[test]
    fn caches_a_variant_under_the_toon_namespace_and_reuses_it() {
        let state = make_gl_scene3d_state();
        let first = ensure_gl_toon_program(&state, &flat());
        let links = calls_named("link_program");
        let second = ensure_gl_toon_program(&state, &flat());
        assert!(Rc::ptr_eq(&first, &second));
        assert_eq!(calls_named("link_program"), links);
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .keys()
                .any(|key| key.starts_with("toon:"))
        );
    }
}

mod get_gl_toon_fragment_source_for_key {
    use super::*;

    #[test]
    fn includes_the_light_block_and_gates_feature_defines_on_their_flag() {
        assert!(get_gl_toon_fragment_source_for_key(&flat()).contains("u_directional"));
        assert!(get_gl_toon_fragment_source_for_key(&flat()).contains("#define MAX_FORWARD_LIGHTS"));
        assert!(!get_gl_toon_fragment_source_for_key(&flat()).contains("#define HAS_BASE_COLOR_MAP"));
        assert!(!get_gl_toon_fragment_source_for_key(&flat()).contains("#define HAS_RAMP"));
        assert!(
            get_gl_toon_fragment_source_for_key(&GlToonDefineKey {
                has_base_color_map: true,
                ..flat()
            })
            .contains("#define HAS_BASE_COLOR_MAP")
        );
        assert!(
            get_gl_toon_fragment_source_for_key(&GlToonDefineKey {
                has_ramp: true,
                ..flat()
            })
            .contains("#define HAS_RAMP")
        );
        assert!(
            get_gl_toon_fragment_source_for_key(&GlToonDefineKey {
                alpha_mask_enabled: true,
                ..flat()
            })
            .contains("#define ALPHA_MASK")
        );
    }

    #[test]
    fn shadow_maps_the_banded_directional_term_and_only_the_directional_term() {
        // The banded directional contribution is multiplied by the shared sampleDirectionalShadow factor,
        // matching the classic/PBR families; ambient stays unshadowed, so the helper appears once.
        for key in [
            flat(),
            GlToonDefineKey {
                has_ramp: true,
                ..flat()
            },
        ] {
            let source = get_gl_toon_fragment_source_for_key(&key);
            assert!(source.contains("sampleDirectionalShadow(v_worldPosition, normal)"));
            assert_eq!(
                source
                    .matches("float sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal)")
                    .count(),
                1
            );
            assert_eq!(source.matches("sampleDirectionalShadow(v_worldPosition, normal)").count(), 1);
        }
    }
}

mod get_gl_toon_vertex_source_for_key {
    use super::*;

    #[test]
    fn passes_world_position_and_normal_varyings_through_the_shared_vertex_transforms() {
        let source = get_gl_toon_vertex_source_for_key(&flat(), None);
        assert!(source.contains("#version 300 es"));
        assert!(source.contains("v_worldPosition"));
        assert!(source.contains("v_normal"));
        assert!(source.contains("u_viewProjection"));
        assert!(source.contains("u_normalMatrix"));
    }

    #[test]
    fn injects_the_skin_declarations_only_for_the_skinned_variant() {
        let skinned = get_gl_toon_vertex_source_for_key(
            &GlToonDefineKey {
                has_skin: Some(true),
                ..flat()
            },
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );
        assert!(skinned.contains("#define HAS_SKIN"));
        assert!(!skinned.contains("#define MAX_JOINTS"));
        assert!(skinned.contains("sampler2D u_jointTexture"));
        assert!(skinned.contains("texelFetch"));
        assert!(skinned.contains("mat4 skinMatrix()"));
        assert!(skinned.contains("a_joints0"));
        let rigid = get_gl_toon_vertex_source_for_key(&flat(), None);
        assert!(!rigid.contains("#define HAS_SKIN"));
        assert!(!rigid.contains("a_joints0"));
    }
}
