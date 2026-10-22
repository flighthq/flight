use super::*;

mod create_ssao_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_ssao_effect();
        effect.write().unwrap().radius = Some(4.0);
        assert_eq!(effect.read().unwrap().radius, Some(4.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_ssao_effect(), "SsaoEffect");
    }
}

mod initialize_ssao_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_ssao_effect() {
        let mut effect: SsaoEffect = flight_entity::allocate_entity();
        initialize_ssao_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "SsaoEffect");
    }
}
