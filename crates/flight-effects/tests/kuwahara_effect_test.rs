use super::*;

mod create_kuwahara_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_kuwahara_effect();
        effect.write().unwrap().radius = Some(3.0);
        assert_eq!(effect.read().unwrap().radius, Some(3.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_kuwahara_effect(), "KuwaharaEffect");
    }
}

mod initialize_kuwahara_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_kuwahara_effect() {
        let mut effect: KuwaharaEffect = flight_entity::allocate_entity();
        initialize_kuwahara_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "KuwaharaEffect");
    }
}
