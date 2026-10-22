use super::*;

mod create_radial_blur_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_radial_blur_effect();
        effect.write().unwrap().strength = Some(0.2);
        assert_eq!(effect.read().unwrap().strength, Some(0.2));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_radial_blur_effect(), "RadialBlurEffect");
    }
}

mod initialize_radial_blur_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_radial_blur_effect() {
        let mut effect: RadialBlurEffect = flight_entity::allocate_entity();
        initialize_radial_blur_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "RadialBlurEffect");
    }
}
