use flight_effects::{
    ADVANCED_BLEND_MODE_COLOR, ADVANCED_BLEND_MODE_COLOR_BURN, ADVANCED_BLEND_MODE_COLOR_DODGE,
    ADVANCED_BLEND_MODE_DARKEN, ADVANCED_BLEND_MODE_DIFFERENCE, ADVANCED_BLEND_MODE_EXCLUSION,
    ADVANCED_BLEND_MODE_HARD_LIGHT, ADVANCED_BLEND_MODE_HUE, ADVANCED_BLEND_MODE_LIGHTEN,
    ADVANCED_BLEND_MODE_LUMINOSITY, ADVANCED_BLEND_MODE_OVERLAY, ADVANCED_BLEND_MODE_SATURATION,
    ADVANCED_BLEND_MODE_SOFT_LIGHT,
};
use flight_render_gl::GlRenderState;
use glow::NativeTexture;

const ALL_MODES: [&str; 13] = [
    ADVANCED_BLEND_MODE_COLOR,
    ADVANCED_BLEND_MODE_COLOR_BURN,
    ADVANCED_BLEND_MODE_COLOR_DODGE,
    ADVANCED_BLEND_MODE_DARKEN,
    ADVANCED_BLEND_MODE_DIFFERENCE,
    ADVANCED_BLEND_MODE_EXCLUSION,
    ADVANCED_BLEND_MODE_HARD_LIGHT,
    ADVANCED_BLEND_MODE_HUE,
    ADVANCED_BLEND_MODE_LIGHTEN,
    ADVANCED_BLEND_MODE_LUMINOSITY,
    ADVANCED_BLEND_MODE_OVERLAY,
    ADVANCED_BLEND_MODE_SATURATION,
    ADVANCED_BLEND_MODE_SOFT_LIGHT,
];

fn make_texture(state: &GlRenderState) -> NativeTexture {
    return flight_render_gl::create_gl_texture(state).unwrap();
}

mod apply_blend_effect_to_gl {
    use flight_effects::create_blend_effect;
    use flight_effects_gl::contract::{
        apply_blend_effect_to_gl, register_gl_blend_effect_backdrop,
    };

    use super::*;
    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 8.0, 8.0);
        let dest = make_texture_target(&state, 8.0, 8.0);
        let backdrop = make_texture(&state);
        register_gl_blend_effect_backdrop(&state, "scene", backdrop);
        let effect = create_blend_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.mode = ADVANCED_BLEND_MODE_OVERLAY.to_string();
            effect.backdrop_key = Some("scene".to_string());
            effect.opacity = Some(0.5);
        }
        clear_calls();
        apply_blend_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap()).unwrap();
        let recorded = draws();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].textures[0], source.texture.0.get() as i32);
        assert_eq!(recorded[0].textures[1], backdrop.0.get() as i32);
        assert_eq!(last_uniform("u_mode"), vec![0.0]);
        assert_eq!(last_uniform("u_opacity"), vec![0.5]);
        assert_eq!(last_uniform("u_hasBackdrop"), vec![1.0]);
    }
}

mod get_blend_effect_mode_index {
    use flight_effects_gl::contract::get_blend_effect_mode_index;

    use super::*;

    #[test]
    fn assigns_the_seven_separable_modes_indices_0_to_6_in_shader_order() {
        assert_eq!(get_blend_effect_mode_index(ADVANCED_BLEND_MODE_OVERLAY), 0);
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_HARD_LIGHT),
            1
        );
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_SOFT_LIGHT),
            2
        );
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_DIFFERENCE),
            3
        );
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_EXCLUSION),
            4
        );
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_COLOR_DODGE),
            5
        );
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_COLOR_BURN),
            6
        );
    }

    #[test]
    fn assigns_the_four_hsl_modes_indices_7_to_10() {
        assert_eq!(get_blend_effect_mode_index(ADVANCED_BLEND_MODE_HUE), 7);
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_SATURATION),
            8
        );
        assert_eq!(get_blend_effect_mode_index(ADVANCED_BLEND_MODE_COLOR), 9);
        assert_eq!(
            get_blend_effect_mode_index(ADVANCED_BLEND_MODE_LUMINOSITY),
            10
        );
    }

    #[test]
    fn maps_a_unique_index_to_every_advanced_mode() {
        let mut indices: Vec<i32> = ALL_MODES
            .iter()
            .map(|mode| get_blend_effect_mode_index(mode))
            .collect();
        assert!(!indices.contains(&-1));
        indices.sort();
        indices.dedup();
        assert_eq!(indices.len(), ALL_MODES.len());
    }

    #[test]
    fn returns_minus_1_normal_passthrough_for_an_unknown_mode() {
        assert_eq!(get_blend_effect_mode_index("acme.Nope"), -1);
    }

    #[test]
    fn has_a_shader_branch_for_every_index_the_table_assigns() {
        use flight_effects_gl::contract::BLEND_FRAGMENT_SRC;
        for mode in ALL_MODES {
            let index = get_blend_effect_mode_index(mode);
            assert!(index >= 0);
            assert!(
                BLEND_FRAGMENT_SRC.contains(&format!("mode == {index}")),
                "{mode} maps to index {index} with no shader branch"
            );
        }
    }
}

mod get_gl_blend_effect_backdrop {
    use flight_effects_gl::contract::{
        get_gl_blend_effect_backdrop, register_gl_blend_effect_backdrop,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn returns_none_for_a_none_key() {
        assert!(get_gl_blend_effect_backdrop(&make_state(), None).is_none());
    }

    #[test]
    fn returns_none_when_nothing_is_registered_under_the_key() {
        assert!(get_gl_blend_effect_backdrop(&make_state(), Some("missing")).is_none());
    }

    #[test]
    fn returns_the_texture_registered_under_the_key() {
        let state = make_state();
        let texture = make_texture(&state);
        register_gl_blend_effect_backdrop(&state, "scene", texture);
        assert_eq!(
            get_gl_blend_effect_backdrop(&state, Some("scene")),
            Some(texture)
        );
    }

    #[test]
    fn isolates_backdrops_per_render_state() {
        let a = make_state();
        let b = make_state();
        register_gl_blend_effect_backdrop(&a, "scene", make_texture(&a));
        assert!(get_gl_blend_effect_backdrop(&b, Some("scene")).is_none());
    }
}

mod gl_blend_effect_runner {
    use flight_effects::create_blend_effect;
    use flight_effects_gl::contract::gl_blend_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, last_uniform, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_blend_effect();
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_blend_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
        assert_eq!(last_uniform("u_hasBackdrop"), vec![0.0]);
    }
}

mod register_gl_blend_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_blend_effect_runner, register_gl_blend_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        register_gl_blend_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "BlendEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_blend_effect_runner as GlEffectRunner
        ));
    }
}

mod register_gl_blend_effect_backdrop {
    use flight_effects_gl::contract::{
        get_gl_blend_effect_backdrop, register_gl_blend_effect_backdrop,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn is_last_write_wins_for_a_given_key() {
        let state = make_state();
        let first = make_texture(&state);
        let second = make_texture(&state);
        register_gl_blend_effect_backdrop(&state, "scene", first);
        register_gl_blend_effect_backdrop(&state, "scene", second);
        assert_eq!(
            get_gl_blend_effect_backdrop(&state, Some("scene")),
            Some(second)
        );
    }
}

mod unregister_gl_blend_effect_backdrop {
    use flight_effects_gl::contract::{
        get_gl_blend_effect_backdrop, register_gl_blend_effect_backdrop,
        unregister_gl_blend_effect_backdrop,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn removes_a_registered_backdrop_and_reports_it_was_present() {
        let state = make_state();
        register_gl_blend_effect_backdrop(&state, "scene", make_texture(&state));
        assert!(unregister_gl_blend_effect_backdrop(&state, "scene"));
        assert!(get_gl_blend_effect_backdrop(&state, Some("scene")).is_none());
    }

    #[test]
    fn reports_false_when_nothing_was_registered() {
        assert!(!unregister_gl_blend_effect_backdrop(&make_state(), "scene"));
    }
}
