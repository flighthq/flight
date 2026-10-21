use flight_adjustments::contract::*;

mod get_adjustment_kind {
    use super::*;

    #[test]
    fn returns_the_kind_string_for_each_variant() {
        let adj: Adjustment = Adjustment::Invert(create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) })));
        assert_eq!(get_adjustment_kind(&adj), "InvertAdjustment");
    }
}

mod initialize_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let adj: Adjustment = Adjustment::Invert(create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) })));
        initialize_adjustment(&adj);
    }
}
