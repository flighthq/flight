use super::*;

mod create_composite_effect {
    use super::*;

    #[test]
    fn builds_a_composite_effect_carrying_the_requested_operator() {
        let effect = create_composite_effect();
        effect.write().unwrap().operator = COMPOSITE_OPERATOR_DESTINATION_OUT.to_string();
        assert_effect_kind(&effect, "CompositeEffect");
        assert_eq!(
            effect.read().unwrap().operator,
            COMPOSITE_OPERATOR_DESTINATION_OUT
        );
    }

    #[test]
    fn spreads_the_backdrop_key_option() {
        let effect = create_composite_effect();
        effect.write().unwrap().backdrop_key = Some("scene.backdrop".to_string());
        assert_eq!(
            effect.read().unwrap().backdrop_key.as_deref(),
            Some("scene.backdrop")
        );
    }

    #[test]
    fn leaves_backdrop_key_unset_when_omitted() {
        assert_eq!(create_composite_effect().read().unwrap().backdrop_key, None);
    }
}

mod initialize_composite_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_composite_effect() {
        let mut effect: CompositeEffect = flight_entity::allocate_entity();
        initialize_composite_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "CompositeEffect");
    }
}
