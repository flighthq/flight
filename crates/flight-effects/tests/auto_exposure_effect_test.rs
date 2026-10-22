use super::*;

mod create_auto_exposure_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_auto_exposure_effect();
        effect.write().unwrap().adaptation_speed = Some(2.0);
        assert_eq!(effect.read().unwrap().adaptation_speed, Some(2.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_auto_exposure_effect(), "AutoExposureEffect");
    }
}

mod initialize_auto_exposure_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_auto_exposure_effect() {
        let mut effect: AutoExposureEffect = flight_entity::allocate_entity();
        initialize_auto_exposure_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "AutoExposureEffect");
    }
}
