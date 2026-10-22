use std::panic::{AssertUnwindSafe, catch_unwind};
use std::rc::Rc;

use flight_materials::PbrExtension;
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{
    count_calls, make_gl_scene3d_state, set_program_link, set_shader_compile, shader_sources,
    test_default,
};

fn make_key() -> GlPbrDefineKey {
    return test_default::<GlPbrDefineKey>();
}

fn make_contribution(key: &str) -> GlPbrExtensionShaderContribution {
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: String::new(),
        contribute_punctual: String::new(),
        finalize: String::new(),
        fragment_declarations: String::new(),
        fragment_functions: String::new(),
        key: key.to_string(),
        samples_transmission_scene_color: None,
        texture_count: 0,
    };
}

fn noop_bind(_context: &mut dyn GlPbrExtensionBindContext, _extension: &PbrExtension) {}

fn vendor_contribution(
    _context: &dyn GlPbrExtensionShaderContext,
    _extension: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    return make_contribution("vendor");
}

fn always_supported(_extension: &PbrExtension) -> bool {
    return true;
}

static FIRST_REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: vendor_contribution,
    is_supported: always_supported,
};

static SECOND_REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: vendor_contribution,
    is_supported: always_supported,
};

fn panic_message(run: impl FnOnce()) -> String {
    let error = catch_unwind(AssertUnwindSafe(run)).expect_err("expected a throw");
    return error
        .downcast_ref::<flight_entity::FlightError>()
        .map(|error| error.message.clone())
        .or_else(|| error.downcast_ref::<String>().cloned())
        .or_else(|| error.downcast_ref::<&str>().map(|value| value.to_string()))
        .unwrap_or_default();
}

fn program_cache_keys(state: &GlRenderState) -> Vec<String> {
    return get_gl_scene3d_runtime(state)
        .program_cache
        .keys()
        .cloned()
        .collect();
}

mod compile_gl_pbr_program {
    use super::*;

    #[test]
    fn compiles_links_and_resolves_the_pbr_uniform_locations() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_pbr_program(&state.gl, &make_key(), None, None, None);
        assert!(program.loc_view_projection.is_some());
        assert!(program.loc_base_color.is_some());
        assert!(program.loc_directional_radiance.is_some());
        assert!(count_calls("link_program") > 0);
    }

    #[test]
    fn resolves_the_full_standard_block_map_uniforms() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_pbr_program(&state.gl, &make_key(), None, None, None);
        assert!(program.loc_metallic_roughness_map.is_some());
        assert!(program.loc_occlusion_map.is_some());
        assert!(program.loc_occlusion_strength.is_some());
        assert!(program.loc_emissive_map.is_some());
    }

    #[test]
    fn throws_on_a_shader_compile_failure() {
        let state = make_gl_scene3d_state();
        set_shader_compile(false);
        let message = panic_message(|| {
            compile_gl_pbr_program(&state.gl, &make_key(), None, None, None);
        });
        assert!(message.contains("compile error"), "{message}");
    }

    #[test]
    fn throws_on_a_program_link_failure() {
        let state = make_gl_scene3d_state();
        set_program_link(false);
        let message = panic_message(|| {
            compile_gl_pbr_program(&state.gl, &make_key(), None, None, None);
        });
        assert!(message.contains("link error"), "{message}");
    }
}

mod ensure_gl_pbr_program {
    use super::*;

    #[test]
    fn compiles_a_variant_once_and_caches_it_by_define_key() {
        let state = make_gl_scene3d_state();
        let first = ensure_gl_pbr_program(&state, &make_key(), None);
        let link_count = count_calls("link_program");
        let second = ensure_gl_pbr_program(&state, &make_key(), None);
        assert!(Rc::ptr_eq(&first, &second));
        assert_eq!(count_calls("link_program"), link_count);
        assert_eq!(get_gl_scene3d_runtime(&state).program_cache.len(), 1);
    }

    #[test]
    fn compiles_a_distinct_program_for_a_different_standard_map_flag() {
        let state = make_gl_scene3d_state();
        ensure_gl_pbr_program(&state, &make_key(), None);
        let key = GlPbrDefineKey {
            has_base_color_map: true,
            ..make_key()
        };
        ensure_gl_pbr_program(&state, &key, None);
        assert_eq!(get_gl_scene3d_runtime(&state).program_cache.len(), 2);
    }

    #[test]
    fn folds_the_render_state_skinned_run_flag_into_a_distinct_has_skin_variant() {
        let state = make_gl_scene3d_state();
        let rigid = ensure_gl_pbr_program(&state, &make_key(), None);
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        let skinned = ensure_gl_pbr_program(&state, &make_key(), None);

        assert!(!Rc::ptr_eq(&skinned, &rigid));
        assert!(program_cache_keys(&state).contains(&"pbr:--------:k-:0:".to_string()));
        assert!(matches!(skinned.loc_joint_texture.get(), Some(Some(_))));
    }

    // Not a TS case: TS ensureGlPbrProgram passes no skin declarations, leaving skinMatrix() undeclared
    // in the HAS_SKIN variant; the Rust port supplies the registered feature's GLSL like every sibling
    // family does.
    #[test]
    fn compiles_the_skinned_variant_with_the_registered_skin_declarations() {
        let state = make_gl_scene3d_state();
        register_gl_mesh_skinning(&state);
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        ensure_gl_pbr_program(&state, &make_key(), None);
        assert!(
            shader_sources()
                .iter()
                .any(|source| source.contains("mat4 skinMatrix()"))
        );
    }

    #[test]
    fn caches_a_distinct_entry_per_registered_contribution_key_under_the_pbr_namespace() {
        let state = make_gl_scene3d_state();
        ensure_gl_pbr_program(&state, &make_key(), Some(&[make_contribution("vendor-a")]));
        ensure_gl_pbr_program(&state, &make_key(), Some(&[make_contribution("vendor-b")]));
        let keys = program_cache_keys(&state);
        assert_eq!(keys.len(), 2);
        for key in keys {
            assert!(key.starts_with("pbr:"));
        }
    }

    #[test]
    fn compiles_a_distinct_same_key_program_after_a_pbr_registration_is_replaced() {
        let mut state = make_gl_scene3d_state();
        let contribution = make_contribution("vendor");
        register_gl_pbr_extension(
            &mut state,
            "VendorExtension".to_string(),
            &FIRST_REGISTRATION,
        );
        let first = ensure_gl_pbr_program(
            &state,
            &make_key(),
            Some(std::slice::from_ref(&contribution)),
        );

        register_gl_pbr_extension(
            &mut state,
            "VendorExtension".to_string(),
            &SECOND_REGISTRATION,
        );
        let second = ensure_gl_pbr_program(
            &state,
            &make_key(),
            Some(std::slice::from_ref(&contribution)),
        );

        assert!(!Rc::ptr_eq(&second, &first));
        assert_eq!(get_gl_scene3d_runtime(&state).program_cache.len(), 2);
    }
}
