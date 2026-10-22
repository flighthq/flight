use super::*;

mod create_glitch_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_glitch_effect();
        assert_effect_kind(&effect, "GlitchEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_glitch_effect();
        let mut guard = effect.write().unwrap();
        guard.intensity = Some(0.7);
        guard.block_size = Some(22.0);
        guard.color_shift = Some(12.0);
        guard.seed = Some(3.0);
        assert_eq!(guard.intensity, Some(0.7));
        assert_eq!(guard.block_size, Some(22.0));
        assert_eq!(guard.color_shift, Some(12.0));
        assert_eq!(guard.seed, Some(3.0));
    }
}

mod get_glitch_effect_padding {
    use super::*;

    #[test]
    fn covers_horizontal_tears_and_the_maximum_rgb_channel_separation() {
        let effect = create_glitch_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.color_shift = Some(10.0);
            guard.intensity = Some(0.5);
        }
        let mut out = zero_padding();
        get_glitch_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 0.0,
                left: 34.0,
                right: 34.0,
                top: 0.0
            }
        );
    }
}

mod initialize_glitch_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_glitch_effect() {
        let mut effect: GlitchEffect = flight_entity::allocate_entity();
        initialize_glitch_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "GlitchEffect");
    }
}

mod register_glitch_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_glitch_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "GlitchEffect"));
        assert!(!has_padding_resolver(&other, "GlitchEffect"));
    }
}
