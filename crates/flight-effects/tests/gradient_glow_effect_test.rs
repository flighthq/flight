use super::*;

mod create_gradient_glow_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_gradient_glow_effect();
        let mut guard = effect.write().unwrap();
        guard.colors = vec![0xff0000, 0x00ff00];
        guard.alphas = vec![1.0, 1.0];
        guard.ratios = vec![0.0, 255.0];
        drop(guard);
        assert_effect_kind(&effect, "GradientGlowEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_gradient_glow_effect();
        let mut guard = effect.write().unwrap();
        guard.colors = vec![0xff0000, 0x00ff00];
        guard.alphas = vec![1.0, 1.0];
        guard.ratios = vec![0.0, 255.0];
        guard.source_mode = Some(EffectSourceMode::Knockout);
        guard.strength = Some(2.0);
        assert_eq!(guard.source_mode, Some(EffectSourceMode::Knockout));
        assert_eq!(guard.strength, Some(2.0));
    }
}

mod get_gradient_glow_effect_padding {
    use super::*;

    #[test]
    fn uses_the_three_sigma_extent_independently_on_both_axes() {
        let effect = create_gradient_glow_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.alphas = vec![1.0];
            guard.blur_x = Some(2.1);
            guard.blur_y = Some(3.0);
            guard.colors = vec![0xffffff];
            guard.ratios = vec![0.0];
        }
        let mut out = zero_padding();
        get_gradient_glow_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 9.0,
                left: 7.0,
                right: 7.0,
                top: 9.0
            }
        );
    }
}

mod initialize_gradient_glow_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_gradient_glow_effect() {
        let mut effect: GradientGlowEffect = flight_entity::allocate_entity();
        initialize_gradient_glow_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "GradientGlowEffect");
    }
}

mod register_gradient_glow_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_gradient_glow_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "GradientGlowEffect"));
        assert!(!has_padding_resolver(&other, "GradientGlowEffect"));
    }
}
