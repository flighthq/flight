use super::*;

mod create_white_balance_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_white_balance_effect();
        effect.write().unwrap().tint = Some(-0.2);
        assert_eq!(effect.read().unwrap().tint, Some(-0.2));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_white_balance_effect(), "WhiteBalanceEffect");
    }
}

mod initialize_white_balance_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_white_balance_effect() {
        let mut effect: WhiteBalanceEffect = flight_entity::allocate_entity();
        initialize_white_balance_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "WhiteBalanceEffect");
    }
}
