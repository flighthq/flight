use std::rc::Rc;

use flight_color::{LinearColor, allocate_linear_color};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{count_calls, make_gl_scene3d_state, test_default};

fn flat() -> GlMatcapDefineKey {
    return GlMatcapDefineKey {
        alpha_mask_enabled: false,
        has_matcap: false,
        ..test_default()
    };
}

fn tint() -> LinearColor {
    let mut tint = allocate_linear_color();
    tint.r = 0.5;
    tint.g = 0.25;
    tint.b = 0.1;
    tint.a = 1.0;
    return tint;
}

mod bind_gl_matcap_surface {
    use super::*;

    #[test]
    fn uploads_the_tint_and_alpha_cutoff_with_no_texture_bind_when_the_matcap_is_absent() {
        let mut state = make_gl_scene3d_state();
        let program = compile_gl_matcap_program(&state.gl.clone(), &flat(), None);
        bind_gl_matcap_surface(&mut state, &program, &tint(), None, 0.5);
        assert!(count_calls("uniform_4_f32") > 0);
        assert!(count_calls("uniform_1_f32") > 0);
        // No matcap → no texture bind.
        assert_eq!(count_calls("bind_texture"), 0);
    }
}

mod build_gl_matcap_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_flag_set() {
        assert_eq!(build_gl_matcap_define_key(&flat()), "----");
        assert_eq!(
            build_gl_matcap_define_key(&GlMatcapDefineKey {
                alpha_mask_enabled: true,
                has_matcap: true,
                ..test_default()
            }),
            "mt--"
        );
        assert_eq!(
            build_gl_matcap_define_key(&GlMatcapDefineKey {
                has_matcap: true,
                ..flat()
            }),
            "-t--"
        );
        assert_eq!(
            build_gl_matcap_define_key(&GlMatcapDefineKey {
                has_skin: Some(true),
                ..flat()
            }),
            "--k-"
        );
    }
}

mod compile_gl_matcap_program {
    use super::*;

    #[test]
    fn compiles_links_and_resolves_the_matcap_uniforms_including_the_normal_matrix_and_view() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_matcap_program(&state.gl, &flat(), None);
        assert!(program.loc_tint.is_some());
        assert!(program.loc_view.is_some());
        assert!(program.loc_normal_matrix.is_some());
        assert!(count_calls("link_program") > 0);
    }
}

mod ensure_gl_matcap_program {
    use super::*;

    #[test]
    fn caches_a_variant_under_the_matcap_namespace_and_reuses_it() {
        let state = make_gl_scene3d_state();
        let first = ensure_gl_matcap_program(&state, &flat());
        let links = count_calls("link_program");
        let second = ensure_gl_matcap_program(&state, &flat());
        assert!(Rc::ptr_eq(&second, &first));
        assert_eq!(count_calls("link_program"), links);
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .keys()
                .any(|key| key.starts_with("matcap:"))
        );
    }

    #[test]
    fn caches_rigid_and_skinned_variants_independently_from_the_active_draw_run() {
        let state = make_gl_scene3d_state();
        let rigid = ensure_gl_matcap_program(&state, &flat());
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        let skinned = ensure_gl_matcap_program(&state, &flat());

        assert!(!Rc::ptr_eq(&skinned, &rigid));
        let mut keys: Vec<String> = get_gl_scene3d_runtime(&state).program_cache.keys().cloned().collect();
        // D17: the Rust program cache is a HashMap; sort to compare against the TS insertion order.
        keys.sort();
        assert_eq!(keys, vec!["matcap:----".to_string(), "matcap:--k-".to_string()]);
    }
}

mod get_gl_matcap_fragment_source_for_key {
    use super::*;

    #[test]
    fn includes_feature_defines_only_when_their_flag_is_set() {
        assert!(!get_gl_matcap_fragment_source_for_key(&flat()).contains("#define HAS_MATCAP"));
        assert!(
            get_gl_matcap_fragment_source_for_key(&GlMatcapDefineKey {
                has_matcap: true,
                ..flat()
            })
            .contains("#define HAS_MATCAP")
        );
        assert!(
            get_gl_matcap_fragment_source_for_key(&GlMatcapDefineKey {
                alpha_mask_enabled: true,
                ..flat()
            })
            .contains("#define ALPHA_MASK")
        );
    }
}

mod get_gl_matcap_vertex_source_for_key {
    use super::*;

    #[test]
    fn builds_the_view_space_normal_from_u_view_and_the_normal_matrix() {
        let src = get_gl_matcap_vertex_source_for_key(&flat(), None);
        assert!(src.contains("layout(location = 1) in vec3 a_normal"));
        assert!(src.contains("mat3(u_view) * (u_normalMatrix * localNormal)"));
    }

    #[test]
    fn deforms_position_and_normal_only_in_the_skinned_variant() {
        let rigid = get_gl_matcap_vertex_source_for_key(&flat(), None);
        let skinned = get_gl_matcap_vertex_source_for_key(
            &GlMatcapDefineKey {
                has_skin: Some(true),
                ..flat()
            },
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );

        assert!(!rigid.contains("#define HAS_SKIN"));
        assert!(!rigid.contains("skinMatrix() *"));
        assert!(skinned.contains("#define HAS_SKIN"));
        assert!(skinned.contains("uniform highp sampler2D u_jointTexture"));
        assert!(skinned.contains("mat4 skin = skinMatrix()"));
        assert!(skinned.contains("skinNormalMatrix() * a_normal"));
        assert!(skinned.contains("u_model * localPosition"));
    }
}
