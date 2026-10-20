use flight_adjustments::*;

mod get_adjustment_kind {
    use super::*;

    #[test]
    fn returns_the_kind_string_for_each_variant() {
        let adj: Adjustment = create_invert_adjustment(1.0).into();
        assert_eq!(get_adjustment_kind(&adj), "InvertAdjustment");
    }
}

mod initialize_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let adj: Adjustment = create_invert_adjustment(1.0).into();
        initialize_adjustment(&adj);
    }
}
