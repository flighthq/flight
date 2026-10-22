use super::*;

mod create_tone_map_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type_and_operator() {
        let effect = create_tone_map_effect();
        effect.write().unwrap().operator = Some(ToneMapOperator::Aces);
        assert_effect_kind(&effect, "ToneMapEffect");
        assert_eq!(effect.read().unwrap().operator, Some(ToneMapOperator::Aces));
    }
}

mod initialize_tone_map_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_tone_map_effect() {
        let mut effect: ToneMapEffect = flight_entity::allocate_entity();
        initialize_tone_map_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "ToneMapEffect");
    }
}
