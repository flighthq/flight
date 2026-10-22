use super::*;

mod create_tilt_shift_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_tilt_shift_effect();
        assert_effect_kind(&effect, "TiltShiftEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_tilt_shift_effect();
        let mut guard = effect.write().unwrap();
        guard.center = Some(0.5);
        guard.width = Some(0.2);
        guard.blur = Some(4.0);
        assert_eq!(guard.center, Some(0.5));
        assert_eq!(guard.width, Some(0.2));
        assert_eq!(guard.blur, Some(4.0));
    }
}

mod get_tilt_shift_effect_padding {
    use super::*;

    #[test]
    fn covers_the_seven_tap_vertical_blur_reach() {
        let effect = create_tilt_shift_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.blur = Some(2.5);
        }
        let mut out = zero_padding();
        get_tilt_shift_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 8.0,
                left: 0.0,
                right: 0.0,
                top: 8.0
            }
        );
    }
}

mod initialize_tilt_shift_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_tilt_shift_effect() {
        let mut effect: TiltShiftEffect = flight_entity::allocate_entity();
        initialize_tilt_shift_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "TiltShiftEffect");
    }
}

mod register_tilt_shift_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_tilt_shift_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "TiltShiftEffect"));
        assert!(!has_padding_resolver(&other, "TiltShiftEffect"));
    }
}
