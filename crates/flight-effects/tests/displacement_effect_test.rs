use super::*;

mod create_displacement_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_displacement_effect();
        assert_effect_kind(&effect, "DisplacementEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_displacement_effect();
        let mut guard = effect.write().unwrap();
        guard.intensity = Some(10.0);
        guard.frequency = Some(14.0);
        guard.seed = Some(2.0);
        assert_eq!(guard.intensity, Some(10.0));
        assert_eq!(guard.frequency, Some(14.0));
        assert_eq!(guard.seed, Some(2.0));
    }
}

mod get_displacement_effect_padding {
    use super::*;

    #[test]
    fn covers_the_shader_maximum_two_axis_sine_warp() {
        let effect = create_displacement_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.intensity = Some(5.0);
        }
        let mut out = zero_padding();
        get_displacement_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 5.0,
                left: 8.0,
                right: 8.0,
                top: 5.0
            }
        );
    }
}

mod initialize_displacement_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_displacement_effect() {
        let mut effect: DisplacementEffect = flight_entity::allocate_entity();
        initialize_displacement_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "DisplacementEffect");
    }
}

mod register_displacement_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_displacement_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "DisplacementEffect"));
        assert!(!has_padding_resolver(&other, "DisplacementEffect"));
    }
}
