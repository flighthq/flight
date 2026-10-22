use super::*;

mod create_gradient_bevel_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_gradient_bevel_effect();
        let mut guard = effect.write().unwrap();
        guard.colors = vec![0xff0000, 0x00ff00];
        guard.alphas = vec![1.0, 1.0];
        guard.ratios = vec![0.0, 255.0];
        drop(guard);
        assert_effect_kind(&effect, "GradientBevelEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_gradient_bevel_effect();
        let mut guard = effect.write().unwrap();
        guard.colors = vec![0xff0000, 0x00ff00];
        guard.alphas = vec![1.0, 1.0];
        guard.ratios = vec![0.0, 255.0];
        guard.source_mode = Some(EffectSourceMode::Hide);
        guard.strength = Some(2.0);
        assert_eq!(guard.source_mode, Some(EffectSourceMode::Hide));
        assert_eq!(guard.strength, Some(2.0));
    }
}

mod get_gradient_bevel_effect_padding {
    use super::*;

    #[test]
    fn adds_the_directional_offset_only_to_the_reached_sides_of_the_gaussian_footprint() {
        let effect = create_gradient_bevel_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.alphas = vec![1.0, 1.0];
            guard.angle = Some(-90.0);
            guard.blur_x = Some(2.0);
            guard.blur_y = Some(3.0);
            guard.colors = vec![0xff0000, 0x00ff00];
            guard.distance = Some(5.0);
            guard.ratios = vec![0.0, 255.0];
        }
        let mut out = zero_padding();
        get_gradient_bevel_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 9.0,
                left: 6.0,
                right: 6.0,
                top: 14.0
            }
        );
    }
}

mod initialize_gradient_bevel_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_gradient_bevel_effect() {
        let mut effect: GradientBevelEffect = flight_entity::allocate_entity();
        initialize_gradient_bevel_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "GradientBevelEffect");
    }
}

mod register_gradient_bevel_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_gradient_bevel_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "GradientBevelEffect"));
        assert!(!has_padding_resolver(&other, "GradientBevelEffect"));
    }
}
