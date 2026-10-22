use flight_effects::Effect;
use flight_effects_gl::contract::{GlEffectContext, GlEffectRegistration};
use flight_render_gl::GlRenderState;

fn noop_runner(_ctx: &mut GlEffectContext<'_>, _effect: &dyn Effect) -> Result<(), String> {
    return Ok(());
}

fn other_runner(_ctx: &mut GlEffectContext<'_>, _effect: &dyn Effect) -> Result<(), String> {
    return Ok(());
}

fn has_key_field(_state: &mut GlRenderState, effect: &dyn Effect) -> bool {
    return effect.get_effect_field("key").is_some();
}

mod get_gl_effect_runner {
    use flight_effects_gl::contract::get_gl_effect_runner;

    use crate::gl_test_helper::make_state;

    #[test]
    fn returns_none_for_an_unregistered_kind() {
        let state = make_state();
        assert!(get_gl_effect_runner(&state, "UnknownEffect").is_none());
    }
}

mod has_gl_effect_runner {
    use flight_effects_gl::contract::{has_gl_effect_runner, register_gl_effect};

    use crate::gl_test_helper::make_state;

    #[test]
    fn returns_false_for_an_unregistered_kind() {
        let state = make_state();
        assert!(!has_gl_effect_runner(&state, "NotRegisteredEffect"));
    }

    #[test]
    fn returns_true_after_a_runner_is_registered() {
        let mut state = make_state();
        register_gl_effect(&mut state, "HasTestEffect", super::noop_runner, None);
        assert!(has_gl_effect_runner(&state, "HasTestEffect"));
    }
}

mod is_gl_effect_resolvable {
    use flight_effects::EffectValue;
    use flight_effects_gl::contract::{is_gl_effect_resolvable, register_gl_effect};

    use crate::gl_test_helper::make_state;
    use crate::{make_effect, make_effect_with_field};

    #[test]
    fn treats_a_kind_registered_without_a_resolver_as_always_resolvable() {
        let mut state = make_state();
        register_gl_effect(&mut state, "ResolvableTestEffect", super::noop_runner, None);
        let effect = make_effect("ResolvableTestEffect");
        assert!(is_gl_effect_resolvable(
            &mut state,
            &*effect.read().unwrap()
        ));
    }

    #[test]
    fn asks_the_registered_resolver_per_effect_instance() {
        let mut state = make_state();
        register_gl_effect(
            &mut state,
            "ResolverTestEffect",
            super::noop_runner,
            Some(super::has_key_field),
        );
        let bare = make_effect("ResolverTestEffect");
        let keyed = make_effect_with_field(
            "ResolverTestEffect",
            "key",
            EffectValue::Text("k".to_string()),
        );
        assert!(!is_gl_effect_resolvable(&mut state, &*bare.read().unwrap()));
        assert!(is_gl_effect_resolvable(&mut state, &*keyed.read().unwrap()));
    }

    #[test]
    fn reports_an_unregistered_kind_as_unresolvable_since_there_is_nothing_to_resolve_it_with() {
        let mut state = make_state();
        let effect = make_effect("NeverRegisteredEffect");
        assert!(!is_gl_effect_resolvable(
            &mut state,
            &*effect.read().unwrap()
        ));
    }
}

mod register_gl_effect {
    use std::sync::Arc;

    use flight_effects_gl::contract::{GlEffectRunner, get_gl_effect_runner, register_gl_effect};

    use crate::gl_test_helper::make_state;

    #[test]
    fn registers_and_retrieves_a_runner() {
        let mut state = make_state();
        let before = Arc::clone(&state.gl_registries.effects);
        register_gl_effect(&mut state, "TestEffect", super::noop_runner, None);
        let runner = get_gl_effect_runner(&state, "TestEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            super::noop_runner as GlEffectRunner
        ));
        assert!(!Arc::ptr_eq(&state.gl_registries.effects, &before));
        assert_eq!(before.entries.len(), 0);
    }

    #[test]
    fn overwrites_an_existing_runner_under_the_same_kind() {
        let mut state = make_state();
        register_gl_effect(&mut state, "TestEffect2", super::noop_runner, None);
        let before = Arc::clone(&state.gl_registries.effects);
        register_gl_effect(&mut state, "TestEffect2", super::other_runner, None);
        let runner = get_gl_effect_runner(&state, "TestEffect2").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            super::other_runner as GlEffectRunner
        ));
        let previous = before.entries["TestEffect2"]
            .downcast_ref::<super::GlEffectRegistration>()
            .unwrap();
        assert!(previous.is_resolvable.is_none());
        assert!(std::ptr::fn_addr_eq(
            previous.runner,
            super::noop_runner as GlEffectRunner
        ));
    }
}
