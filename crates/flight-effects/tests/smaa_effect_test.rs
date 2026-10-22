use super::*;

mod create_smaa_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_smaa_effect();
        effect.write().unwrap().threshold = Some(0.1);
        assert_eq!(effect.read().unwrap().threshold, Some(0.1));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_smaa_effect(), "SmaaEffect");
    }
}

mod initialize_smaa_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_smaa_effect() {
        let mut effect: SmaaEffect = flight_entity::allocate_entity();
        initialize_smaa_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "SmaaEffect");
    }
}
