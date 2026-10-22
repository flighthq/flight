use super::*;

mod create_inner_shadow_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_inner_shadow_effect();
        assert_effect_kind(&effect, "InnerShadowEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_inner_shadow_effect();
        let mut guard = effect.write().unwrap();
        guard.strength = Some(2.0);
        assert_eq!(guard.strength, Some(2.0));
    }

    #[test]
    fn carries_source_mode() {
        let effect = create_inner_shadow_effect();
        let mut guard = effect.write().unwrap();
        guard.source_mode = Some(InnerEffectSourceMode::Hide);
        assert_eq!(guard.source_mode, Some(InnerEffectSourceMode::Hide));
    }
}

mod get_inner_shadow_effect_padding {
    use super::*;

    #[test]
    fn preserves_the_directional_exterior_samples_needed_by_the_clipped_inner_pass() {
        let effect = create_inner_shadow_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.angle = Some(90.0);
            guard.blur_x = Some(2.0);
            guard.blur_y = Some(3.0);
            guard.distance = Some(5.0);
        }
        let mut out = zero_padding();
        get_inner_shadow_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 14.0,
                left: 6.0,
                right: 6.0,
                top: 9.0
            }
        );
    }
}

mod initialize_inner_shadow_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_inner_shadow_effect() {
        let mut effect: InnerShadowEffect = flight_entity::allocate_entity();
        initialize_inner_shadow_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "InnerShadowEffect");
    }
}

mod register_inner_shadow_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_inner_shadow_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "InnerShadowEffect"));
        assert!(!has_padding_resolver(&other, "InnerShadowEffect"));
    }
}
