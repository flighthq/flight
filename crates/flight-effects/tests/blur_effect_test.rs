//! flight-compiler: target-native

use super::*;

mod create_blur_effect {
    use super::*;

    #[test]
    fn round_trips_a_pixel_blur_through_the_property_protocol_as_an_exact_double() {
        // 0.1 has no exact f32: an f32 blur field would read back 0.10000000149011612.
        let effect = create_blur_effect();
        let mut guard = effect.write().unwrap();
        assert!(guard.set_effect_field("blurX", EffectValue::Number(0.1)));
        assert_eq!(guard.blur_x, Some(0.1));
        assert_eq!(
            guard.get_effect_field("blurX"),
            Some(EffectValue::Number(0.1))
        );
    }

    #[test]
    fn sets_the_kind() {
        let effect = create_blur_effect();
        assert_effect_kind(&effect, "BlurEffect");
    }

    #[test]
    fn defaults_to_no_options_beyond_kind() {
        let effect = create_blur_effect();
        let guard = effect.write().unwrap();
        assert_eq!(guard.blur_x, None);
        assert_eq!(guard.blur_y, None);
    }

    #[test]
    fn carries_through_blur_x_and_blur_y() {
        let effect = create_blur_effect();
        let mut guard = effect.write().unwrap();
        guard.blur_x = Some(6.0);
        guard.blur_y = Some(3.0);
        assert_eq!(guard.blur_x, Some(6.0));
        assert_eq!(guard.blur_y, Some(3.0));
    }
}

mod get_blur_effect_padding {
    use super::*;

    #[test]
    fn derives_padding_from_an_f64_blur_beyond_f32_precision() {
        // 3 * 16777216.4 = 50331649.2 ceils to 50331650; an f32 blur (16777216) gives 50331648.
        let effect = create_blur_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.blur_x = Some(16_777_216.4);
            guard.blur_y = Some(0.0);
        }
        let mut out = zero_padding();
        get_blur_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!((out.left, out.right), (50_331_650.0, 50_331_650.0));
    }

    #[test]
    fn derives_directional_gaussian_footprint_from_ceil_three_sigma() {
        let effect = create_blur_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.blur_x = Some(2.1);
            guard.blur_y = Some(3.2);
        }
        let mut out = zero_padding();
        get_blur_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 10.0,
                left: 7.0,
                right: 7.0,
                top: 10.0
            }
        );
    }
}

mod initialize_blur_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_blur_effect() {
        let mut effect: BlurEffect = flight_entity::allocate_entity();
        initialize_blur_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "BlurEffect");
    }
}

mod register_blur_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_blur_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "BlurEffect"));
        assert!(!has_padding_resolver(&other, "BlurEffect"));
    }
}
