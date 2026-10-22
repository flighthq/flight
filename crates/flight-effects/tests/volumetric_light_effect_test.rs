use super::*;

mod create_volumetric_light_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_volumetric_light_effect();
        effect.write().unwrap().samples = Some(64.0);
        assert_eq!(effect.read().unwrap().samples, Some(64.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_volumetric_light_effect(), "VolumetricLightEffect");
    }
}

mod initialize_volumetric_light_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_volumetric_light_effect() {
        let mut effect: VolumetricLightEffect = flight_entity::allocate_entity();
        initialize_volumetric_light_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "VolumetricLightEffect");
    }
}
