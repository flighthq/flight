use std::rc::Rc;

use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{count_calls, make_gl_scene3d_state};

mod compile_gl_wireframe_program {
    use super::*;

    #[test]
    fn compiles_links_and_resolves_the_color_transform_locations_with_a_null_normal_matrix() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_wireframe_program(&state.gl, None, None, None);
        assert!(program.loc_color.is_some());
        assert!(program.loc_view_projection.is_some());
        assert!(program.loc_normal_matrix.is_none());
        assert!(count_calls("link_program") > 0);
    }
}

mod ensure_gl_wireframe_program {
    use super::*;

    #[test]
    fn caches_the_single_wireframe_program_under_the_wireframe_namespace() {
        let state = make_gl_scene3d_state();
        let first = ensure_gl_wireframe_program(&state, None);
        let links = count_calls("link_program");
        let second = ensure_gl_wireframe_program(&state, None);
        assert!(Rc::ptr_eq(&second, &first));
        assert_eq!(count_calls("link_program"), links);
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .keys()
                .any(|key| key.starts_with("wireframe:"))
        );
    }

    #[test]
    fn caches_rigid_and_skinned_variants_independently_from_the_active_draw_run() {
        let state = make_gl_scene3d_state();
        let rigid = ensure_gl_wireframe_program(&state, None);
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        let skinned = ensure_gl_wireframe_program(&state, None);

        assert!(!Rc::ptr_eq(&skinned, &rigid));
        let mut keys: Vec<String> = get_gl_scene3d_runtime(&state).program_cache.keys().cloned().collect();
        // D17: the Rust program cache is a HashMap; sort to compare against the TS insertion order.
        keys.sort();
        assert_eq!(
            keys,
            vec!["wireframe:base|rigid".to_string(), "wireframe:base|skin".to_string()]
        );
    }
}

mod get_gl_wireframe_fragment_source {
    use super::*;

    #[test]
    fn outputs_the_flat_color_uniform() {
        assert!(get_gl_wireframe_fragment_source(None).contains("u_color"));
    }

    #[test]
    fn emits_alpha_cutoff_discard_only_for_the_masked_variant() {
        assert!(!get_gl_wireframe_fragment_source(None).contains("#define ALPHA_MASK"));
        let masked = get_gl_wireframe_fragment_source(Some(true));
        assert!(masked.contains("#define ALPHA_MASK"));
        assert!(masked.contains("fragColor.a < u_alphaCutoff"));
    }
}

mod get_gl_wireframe_vertex_source {
    use super::*;

    #[test]
    fn transforms_position_by_model_and_view_projection() {
        let source = get_gl_wireframe_vertex_source(None, None);
        assert!(source.contains("a_position"));
        assert!(source.contains("u_viewProjection"));
        assert!(source.contains("u_model"));
    }

    #[test]
    fn deforms_position_through_the_palette_only_in_the_skinned_variant() {
        let rigid = get_gl_wireframe_vertex_source(None, None);
        let skinned = get_gl_wireframe_vertex_source(Some(true), Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL));

        assert!(!rigid.contains("#define HAS_SKIN"));
        assert!(!rigid.contains("uniform highp sampler2D u_jointTexture"));
        assert!(skinned.contains("#define HAS_SKIN"));
        assert!(skinned.contains("uniform highp sampler2D u_jointTexture"));
        assert!(skinned.contains("skinMatrix() * vec4(a_position, 1.0)"));
    }
}
