use super::*;

mod create_inner_glow_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_inner_glow_effect();
        assert_effect_kind(&effect, "InnerGlowEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_inner_glow_effect();
        let mut guard = effect.write().unwrap();
        guard.strength = Some(2.0);
        assert_eq!(guard.strength, Some(2.0));
    }

    #[test]
    fn carries_source_mode() {
        let effect = create_inner_glow_effect();
        let mut guard = effect.write().unwrap();
        guard.source_mode = Some(InnerEffectSourceMode::Hide);
        assert_eq!(guard.source_mode, Some(InnerEffectSourceMode::Hide));
    }
}

mod get_inner_glow_effect_padding {
    use super::*;

    #[test]
    fn uses_a_three_sigma_gaussian_footprint() {
        let effect = create_inner_glow_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.blur_x = Some(2.0);
            guard.blur_y = Some(3.0);
        }
        let mut out = zero_padding();
        get_inner_glow_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 9.0,
                left: 6.0,
                right: 6.0,
                top: 9.0
            }
        );
    }
}

mod initialize_inner_glow_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_inner_glow_effect() {
        let mut effect: InnerGlowEffect = flight_entity::allocate_entity();
        initialize_inner_glow_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "InnerGlowEffect");
    }
}

mod register_inner_glow_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_inner_glow_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "InnerGlowEffect"));
        assert!(!has_padding_resolver(&other, "InnerGlowEffect"));
    }
}
