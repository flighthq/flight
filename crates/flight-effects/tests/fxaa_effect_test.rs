use super::*;

mod create_fxaa_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_fxaa_effect();
        effect.write().unwrap().edge_threshold = Some(0.05);
        assert_eq!(effect.read().unwrap().edge_threshold, Some(0.05));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_fxaa_effect(), "FxaaEffect");
    }
}

mod initialize_fxaa_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_fxaa_effect() {
        let mut effect: FxaaEffect = flight_entity::allocate_entity();
        initialize_fxaa_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "FxaaEffect");
    }
}
