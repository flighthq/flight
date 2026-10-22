use std::sync::Arc;

use flight_effects::Effect;
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

fn noop_runner(_context: &mut WgpuEffectContext<'_>, _effect: &dyn Effect) {}

fn other_runner(_context: &mut WgpuEffectContext<'_>, _effect: &dyn Effect) {}

fn has_key(_state: &mut WgpuRenderState, effect: &dyn Effect) -> bool {
    return effect.get_effect_field("key").is_some();
}

mod get_wgpu_effect_runner {
    use super::*;

    #[test]
    fn returns_none_when_no_runner_is_registered_for_the_kind() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "VignetteEffect").is_none());
    }
}

mod has_wgpu_effect_runner {
    use super::*;

    #[test]
    fn returns_false_when_no_runner_is_registered_for_the_kind() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(!has_wgpu_effect_runner(&state, "VignetteEffect"));
    }

    #[test]
    fn returns_true_after_a_runner_is_registered_for_the_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_effect(&mut state, "VignetteEffect", noop_runner, None);
        assert!(has_wgpu_effect_runner(&state, "VignetteEffect"));
    }
}

mod is_wgpu_effect_resolvable {
    use super::*;

    #[test]
    fn treats_a_runner_without_a_resolver_as_always_resolvable() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_effect(&mut state, "acme.Always", noop_runner, None);
        let effect = create_test_effect("acme.Always");
        assert!(is_wgpu_effect_resolvable(
            &mut state,
            &*effect.read().unwrap()
        ));
    }

    #[test]
    fn asks_the_resolver_for_each_effect_instance() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_effect(&mut state, "acme.Named", noop_runner, Some(has_key));
        let bare = create_test_effect("acme.Named");
        let keyed = create_test_effect_with_key("acme.Named", "ready");
        assert!(!is_wgpu_effect_resolvable(
            &mut state,
            &*bare.read().unwrap()
        ));
        assert!(is_wgpu_effect_resolvable(
            &mut state,
            &*keyed.read().unwrap()
        ));
    }

    #[test]
    fn returns_false_for_an_unregistered_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        let effect = create_test_effect("acme.Unregistered");
        assert!(!is_wgpu_effect_resolvable(
            &mut state,
            &*effect.read().unwrap()
        ));
    }
}

mod register_wgpu_effect {
    use super::*;

    #[test]
    fn registers_a_runner_retrievable_by_its_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        let before = get_wgpu_render_state_runtime(&state)
            .registries
            .effects
            .clone();

        register_wgpu_effect(&mut state, "VignetteEffect", noop_runner, None);

        let expected: WgpuEffectRunner = noop_runner;
        assert!(
            get_wgpu_effect_runner(&state, "VignetteEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(!Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&state).registries.effects,
            &before
        ));
        assert!(before.entries.is_empty());
    }

    #[test]
    fn is_last_write_wins_without_mutating_the_earlier_snapshot() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_effect(&mut state, "TestEffect", noop_runner, None);
        let before = get_wgpu_render_state_runtime(&state)
            .registries
            .effects
            .clone();

        register_wgpu_effect(&mut state, "TestEffect", other_runner, None);

        let latest: WgpuEffectRunner = other_runner;
        let earlier: WgpuEffectRunner = noop_runner;
        assert!(
            get_wgpu_effect_runner(&state, "TestEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, latest))
        );
        let snapshot = before.entries.get("TestEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(snapshot.runner, earlier));
        assert!(snapshot.is_resolvable.is_none());
    }
}
