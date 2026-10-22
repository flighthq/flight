use super::*;

mod create_crt_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_crt_effect();
        effect.write().unwrap().curvature = Some(0.2);
        assert_eq!(effect.read().unwrap().curvature, Some(0.2));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_crt_effect(), "CrtEffect");
    }
}

mod initialize_crt_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_crt_effect() {
        let mut effect: CrtEffect = flight_entity::allocate_entity();
        initialize_crt_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "CrtEffect");
    }
}
