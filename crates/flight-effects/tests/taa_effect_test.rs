use super::*;

mod create_taa_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_taa_effect();
        effect.write().unwrap().feedback = Some(0.9);
        assert_eq!(effect.read().unwrap().feedback, Some(0.9));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_taa_effect(), "TaaEffect");
    }
}

mod initialize_taa_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_taa_effect() {
        let mut effect: TaaEffect = flight_entity::allocate_entity();
        initialize_taa_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "TaaEffect");
    }
}
