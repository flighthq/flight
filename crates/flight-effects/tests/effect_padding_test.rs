use super::*;
use flight_entity::UnknownValue;
use flight_render::{EffectPaddingResolver, RenderRegistryTable, enable_render_registry_signals};
use flight_signals::connect_signal;

#[derive(Default)]
struct TestEffect {
    fields: EffectFields,
}

flight_effects::impl_effect!(TestEffect);

fn test_effect(kind: &str) -> EffectRef {
    let mut effect: TestEffect = flight_entity::allocate_entity();
    initialize_effect(&mut effect, kind);
    return owned_effect(effect);
}

fn first_resolver(_: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 1.0,
        left: 2.0,
        right: 3.0,
        top: 4.0,
    };
}

fn pointwise_resolver(_: &UnknownValue) -> EffectPadding {
    return zero_padding();
}

fn replacement_resolver(_: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 4.0,
        left: 3.0,
        right: 2.0,
        top: 1.0,
    };
}

mod compute_effect_padding {
    use super::*;

    fn registered_state() -> BaseRenderState {
        let mut state = fresh_render_state();
        register_blur_effect_padding_resolver(&mut state);
        register_effect_padding_resolver(&mut state, "acme.Pointwise", Some(pointwise_resolver));
        return state;
    }

    #[test]
    fn adds_each_side_across_a_sequential_effect_chain() {
        let mut state = registered_state();
        let first = create_blur_effect();
        first.write().unwrap().blur_x = Some(2.0);
        first.write().unwrap().blur_y = Some(1.0);
        let second = create_blur_effect();
        second.write().unwrap().blur_x = Some(1.0);
        second.write().unwrap().blur_y = Some(4.0);
        let effects = [
            effect_ref(first),
            test_effect("acme.Pointwise"),
            effect_ref(second),
        ];
        let mut out = zero_padding();
        compute_effect_padding(&mut out, &mut state, &effects);
        assert_eq!(
            out,
            EffectPadding {
                bottom: 15.0,
                left: 9.0,
                right: 9.0,
                top: 15.0
            }
        );
    }

    #[test]
    fn emits_a_shared_registry_miss_only_when_the_signal_seam_is_enabled() {
        let mut state = registered_state();
        let misses = Arc::new(RwLock::new(Vec::new()));
        let listener_misses = misses.clone();
        let signals = enable_render_registry_signals(&mut state);
        connect_signal(
            &signals.on_registry_miss,
            Arc::new(move |value: &(RenderRegistryTable, String)| {
                listener_misses.write().unwrap().push(value.clone());
            }),
            None,
        );
        let mut out = zero_padding();
        compute_effect_padding(&mut out, &mut state, &[test_effect("acme.Missing")]);
        assert_eq!(out, zero_padding());
        assert_eq!(
            *misses.read().unwrap(),
            vec![(
                RenderRegistryTable::EffectPaddingResolver,
                "acme.Missing".to_string()
            )],
        );
    }

    #[test]
    fn returns_zero_for_an_unregistered_kind() {
        let mut state = registered_state();
        let mut out = EffectPadding {
            bottom: -1.0,
            left: -1.0,
            right: -1.0,
            top: -1.0,
        };
        compute_effect_padding(&mut out, &mut state, &[test_effect("acme.Missing")]);
        assert_eq!(out, zero_padding());
    }

    #[test]
    fn writes_into_the_caller_owned_output() {
        let mut state = registered_state();
        let first = create_blur_effect();
        first.write().unwrap().blur_x = Some(2.0);
        first.write().unwrap().blur_y = Some(1.0);
        let second = create_blur_effect();
        second.write().unwrap().blur_x = Some(1.0);
        second.write().unwrap().blur_y = Some(4.0);
        let mut out = EffectPadding {
            bottom: -1.0,
            left: -1.0,
            right: -1.0,
            top: -1.0,
        };
        let address = std::ptr::addr_of!(out);
        compute_effect_padding(
            &mut out,
            &mut state,
            &[effect_ref(first), effect_ref(second)],
        );
        assert_eq!(std::ptr::addr_of!(out), address);
        assert_eq!(
            out,
            EffectPadding {
                bottom: 15.0,
                left: 9.0,
                right: 9.0,
                top: 15.0
            }
        );
    }
}

mod explain_effect_padding {
    use super::*;

    #[test]
    fn reports_every_missing_resolver_kind_while_preserving_resolved_padding() {
        let mut state = fresh_render_state();
        register_blur_effect_padding_resolver(&mut state);
        let blur = create_blur_effect();
        blur.write().unwrap().blur_x = Some(2.0);
        blur.write().unwrap().blur_y = Some(3.0);
        let mut out = EffectPaddingExplanation {
            missing_kinds: Vec::new(),
            padding: zero_padding(),
            status: EffectPaddingStatus::Complete,
        };
        explain_effect_padding(
            &mut out,
            &mut state,
            &[effect_ref(blur), test_effect("acme.Missing")],
        );
        assert_eq!(out.missing_kinds, vec!["acme.Missing".to_string()]);
        assert_eq!(
            out.padding,
            EffectPadding {
                bottom: 9.0,
                left: 6.0,
                right: 6.0,
                top: 9.0
            }
        );
        assert_eq!(out.status, EffectPaddingStatus::MissingResolver);
    }
}

mod get_directional_effect_padding {
    use super::*;

    #[test]
    fn adds_negative_screen_space_offsets_only_to_left_and_top() {
        let mut out = zero_padding();
        get_directional_effect_padding(&mut out, 1.0, 1.0, -2.5, -4.25);
        assert_eq!(
            out,
            EffectPadding {
                bottom: 3.0,
                left: 6.0,
                right: 3.0,
                top: 8.0
            }
        );
    }

    #[test]
    fn adds_positive_screen_space_offsets_only_to_reached_sides() {
        let mut out = zero_padding();
        get_directional_effect_padding(&mut out, 2.0, 3.0, 4.25, 5.5);
        assert_eq!(
            out,
            EffectPadding {
                bottom: 15.0,
                left: 6.0,
                right: 11.0,
                top: 9.0
            }
        );
    }
}

mod get_gaussian_effect_padding {
    use super::*;

    #[test]
    fn uses_a_sanitized_three_sigma_extent_on_each_axis() {
        let mut out = zero_padding();
        get_gaussian_effect_padding(&mut out, 2.1, -4.0);
        assert_eq!(
            out,
            EffectPadding {
                bottom: 0.0,
                left: 7.0,
                right: 7.0,
                top: 0.0
            }
        );
    }
}

mod register_effect_padding_resolver {
    use super::*;

    #[test]
    fn adds_and_removes_a_state_local_resolver() {
        let mut state = fresh_render_state();
        register_effect_padding_resolver(&mut state, "acme.Effect", Some(first_resolver));
        let before = state
            .render_registries()
            .effect_padding_resolvers
            .clone()
            .unwrap();
        let before_resolver = *before.entries.get("acme.Effect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            before_resolver,
            first_resolver as EffectPaddingResolver
        ));
        register_effect_padding_resolver(&mut state, "acme.Effect", None);
        let after = state
            .render_registries()
            .effect_padding_resolvers
            .as_ref()
            .unwrap();
        assert!(!Arc::ptr_eq(&before, after));
        assert!(!after.entries.contains_key("acme.Effect"));
    }

    #[test]
    fn replaces_a_registration_without_mutating_the_earlier_snapshot() {
        let mut state = fresh_render_state();
        register_effect_padding_resolver(&mut state, "acme.Effect", Some(first_resolver));
        let before = state
            .render_registries()
            .effect_padding_resolvers
            .clone()
            .unwrap();
        register_effect_padding_resolver(&mut state, "acme.Effect", Some(replacement_resolver));
        let old = *before.entries.get("acme.Effect").unwrap();
        let replacement = *state
            .render_registries()
            .effect_padding_resolvers
            .as_ref()
            .unwrap()
            .entries
            .get("acme.Effect")
            .unwrap();
        assert!(std::ptr::fn_addr_eq(
            old,
            first_resolver as EffectPaddingResolver
        ));
        assert!(std::ptr::fn_addr_eq(
            replacement,
            replacement_resolver as EffectPaddingResolver
        ));
    }
}
