use super::*;

mod create_barrel_distortion_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_barrel_distortion_effect();
        effect.write().unwrap().amount = Some(0.3);
        assert_eq!(effect.read().unwrap().amount, Some(0.3));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_barrel_distortion_effect(), "BarrelDistortionEffect");
    }
}

mod initialize_barrel_distortion_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_barrel_distortion_effect() {
        let mut effect: BarrelDistortionEffect = flight_entity::allocate_entity();
        initialize_barrel_distortion_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "BarrelDistortionEffect");
    }
}
