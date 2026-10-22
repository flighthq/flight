use super::*;

mod create_lens_distortion_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_lens_distortion_effect();
        effect.write().unwrap().amount = Some(0.3);
        assert_eq!(effect.read().unwrap().amount, Some(0.3));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_lens_distortion_effect(), "LensDistortionEffect");
    }
}

mod initialize_lens_distortion_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_lens_distortion_effect() {
        let mut effect: LensDistortionEffect = flight_entity::allocate_entity();
        initialize_lens_distortion_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "LensDistortionEffect");
    }
}
