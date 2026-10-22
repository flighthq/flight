use flight_effects::{CustomShaderEffect, create_custom_shader_effect};
use flight_entity::Ref;

const FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() { o_color = texture(u_texture0, v_texCoord); }";

fn replacement() -> String {
    return FRAGMENT_SRC.replace("texture(u_texture0, v_texCoord)", "vec4(1.0)");
}

fn custom_shader_effect(shader_key: &str) -> Ref<CustomShaderEffect> {
    let effect = create_custom_shader_effect();
    effect.write().unwrap().shader_key = shader_key.to_string();
    return effect;
}

mod apply_custom_shader_effect_to_gl {
    use std::collections::HashMap;

    use flight_effects::CustomShaderUniformValue;
    use flight_effects_gl::contract::{
        apply_custom_shader_effect_to_gl, register_gl_custom_shader_source,
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
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        let effect = custom_shader_effect("ripple");
        effect.write().unwrap().uniforms = Some(HashMap::from([
            (
                "u_amount".to_string(),
                CustomShaderUniformValue::Number(0.5),
            ),
            (
                "u_center".to_string(),
                CustomShaderUniformValue::NumberList(vec![0.25, 0.75]),
            ),
        ]));
        clear_calls();
        apply_custom_shader_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap())
            .unwrap();
        assert_eq!(draws().len(), 1);
        assert_eq!(last_uniform("u_amount"), vec![0.5]);
        assert_eq!(last_uniform("u_center"), vec![0.25, 0.75]);
    }
}

mod get_gl_custom_shader_source {
    use flight_effects_gl::contract::{
        get_gl_custom_shader_source, register_gl_custom_shader_source,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn returns_none_when_no_source_is_registered_for_the_key() {
        assert!(get_gl_custom_shader_source(&make_state(), "missing").is_none());
    }

    #[test]
    fn returns_the_source_registered_under_the_key() {
        let mut state = make_state();
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        assert_eq!(
            get_gl_custom_shader_source(&state, "ripple").as_deref(),
            Some(FRAGMENT_SRC)
        );
    }

    #[test]
    fn isolates_sources_per_render_state() {
        let mut a = make_state();
        let b = make_state();
        register_gl_custom_shader_source(&mut a, "ripple", FRAGMENT_SRC);
        assert!(get_gl_custom_shader_source(&b, "ripple").is_none());
    }
}

mod gl_custom_shader_effect_runner {
    use flight_effects_gl::contract::gl_custom_shader_effect_runner;

    use super::*;
    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = custom_shader_effect("absent");
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_custom_shader_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        // An unregistered key copies the input through: one passthrough draw.
        assert_eq!(draws().len(), 1);
    }
}

mod is_gl_custom_shader_effect_resolvable {
    use flight_effects_gl::contract::{
        is_gl_custom_shader_effect_resolvable, register_gl_custom_shader_source,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn is_false_for_a_shader_key_with_no_registered_source_which_is_the_identity_passthrough_case()
    {
        let mut state = make_state();
        let effect = custom_shader_effect("ripple");
        assert!(!is_gl_custom_shader_effect_resolvable(
            &mut state,
            &*effect.read().unwrap()
        ));
    }

    #[test]
    fn is_true_once_the_key_names_registered_source() {
        let mut state = make_state();
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        let effect = custom_shader_effect("ripple");
        assert!(is_gl_custom_shader_effect_resolvable(
            &mut state,
            &*effect.read().unwrap()
        ));
    }

    #[test]
    fn answers_per_effect_instance_so_two_effects_of_this_kind_can_disagree() {
        let mut state = make_state();
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        let registered = custom_shader_effect("ripple");
        let missing = custom_shader_effect("absent");
        assert!(is_gl_custom_shader_effect_resolvable(
            &mut state,
            &*registered.read().unwrap()
        ));
        assert!(!is_gl_custom_shader_effect_resolvable(
            &mut state,
            &*missing.read().unwrap()
        ));
    }
}

mod register_gl_custom_shader_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_custom_shader_effect_runner,
        register_gl_custom_shader_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        register_gl_custom_shader_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "CustomShaderEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_custom_shader_effect_runner as GlEffectRunner
        ));
    }
}

mod register_gl_custom_shader_source {
    use std::sync::Arc;

    use flight_effects_gl::contract::{
        get_gl_custom_shader_source, register_gl_custom_shader_source,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn registers_a_source_that_get_gl_custom_shader_source_then_resolves() {
        let mut state = make_state();
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        assert_eq!(
            get_gl_custom_shader_source(&state, "ripple").as_deref(),
            Some(FRAGMENT_SRC)
        );
    }

    #[test]
    fn is_last_write_wins_for_a_given_key() {
        let mut state = make_state();
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        register_gl_custom_shader_source(&mut state, "ripple", &replacement());
        assert_eq!(
            get_gl_custom_shader_source(&state, "ripple"),
            Some(replacement())
        );
    }

    #[test]
    fn replaces_the_persistent_table_while_an_explicitly_copied_state_retains_its_snapshot() {
        let mut screen = make_state();
        register_gl_custom_shader_source(&mut screen, "ripple", FRAGMENT_SRC);
        let snapshot = Arc::clone(&screen.gl_registries.custom_effect_shaders);
        let derived = crate::derive_render_state(&screen);

        register_gl_custom_shader_source(&mut screen, "ripple", &replacement());

        assert!(Arc::ptr_eq(
            &derived.gl_registries.custom_effect_shaders,
            &snapshot
        ));
        assert!(!Arc::ptr_eq(
            &screen.gl_registries.custom_effect_shaders,
            &snapshot
        ));
        assert_eq!(
            snapshot.entries.get("ripple").map(String::as_str),
            Some(FRAGMENT_SRC)
        );
        assert_eq!(
            get_gl_custom_shader_source(&derived, "ripple").as_deref(),
            Some(FRAGMENT_SRC)
        );
        assert_eq!(
            get_gl_custom_shader_source(&screen, "ripple"),
            Some(replacement())
        );
    }
}

mod set_gl_custom_shader_source_guard {
    use std::sync::{Arc, Mutex};

    use flight_effects_gl::contract::{
        get_gl_custom_shader_source, register_gl_custom_shader_source,
        set_gl_custom_shader_source_guard,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn fires_with_both_sources_when_a_key_is_overwritten_with_different_source() {
        let mut state = make_state();
        let calls = Arc::new(Mutex::new(Vec::<(String, String, String)>::new()));
        let sink = Arc::clone(&calls);
        set_gl_custom_shader_source_guard(
            &state,
            Some(Arc::new(move |_state, key, previous, next| {
                sink.lock().unwrap().push((
                    key.to_string(),
                    next.to_string(),
                    previous.to_string(),
                ));
            })),
        );
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        register_gl_custom_shader_source(&mut state, "ripple", &replacement());
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(
                "ripple".to_string(),
                replacement(),
                FRAGMENT_SRC.to_string()
            )]
        );
        assert_eq!(
            get_gl_custom_shader_source(&state, "ripple"),
            Some(replacement())
        );
    }

    #[test]
    fn stays_silent_on_the_first_registration_of_a_key_which_compiles_the_source_it_names() {
        let mut state = make_state();
        let calls = Arc::new(Mutex::new(0));
        let sink = Arc::clone(&calls);
        set_gl_custom_shader_source_guard(
            &state,
            Some(Arc::new(move |_, _, _, _| *sink.lock().unwrap() += 1)),
        );
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        assert_eq!(*calls.lock().unwrap(), 0);
        assert_eq!(
            get_gl_custom_shader_source(&state, "ripple").as_deref(),
            Some(FRAGMENT_SRC)
        );
    }

    #[test]
    fn stays_silent_when_the_same_source_is_registered_again_which_changes_nothing() {
        let mut state = make_state();
        let calls = Arc::new(Mutex::new(0));
        let sink = Arc::clone(&calls);
        set_gl_custom_shader_source_guard(
            &state,
            Some(Arc::new(move |_, _, _, _| *sink.lock().unwrap() += 1)),
        );
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        assert_eq!(*calls.lock().unwrap(), 0);
    }

    #[test]
    fn stops_firing_once_cleared_and_never_fires_for_a_state_that_never_installed_one() {
        let mut state = make_state();
        let mut other = make_state();
        let calls = Arc::new(Mutex::new(0));
        let sink = Arc::clone(&calls);
        set_gl_custom_shader_source_guard(
            &state,
            Some(Arc::new(move |_, _, _, _| *sink.lock().unwrap() += 1)),
        );
        set_gl_custom_shader_source_guard(&state, None);
        register_gl_custom_shader_source(&mut state, "ripple", FRAGMENT_SRC);
        register_gl_custom_shader_source(&mut state, "ripple", &replacement());
        register_gl_custom_shader_source(&mut other, "ripple", FRAGMENT_SRC);
        register_gl_custom_shader_source(&mut other, "ripple", &replacement());
        assert_eq!(*calls.lock().unwrap(), 0);
    }
}
