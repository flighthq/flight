use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_color_matrix_adjustment {
    use super::*;

    #[test]
    fn creates_an_authored_generic_matrix_adjustment() {
        let matrix = create_identity_color_matrix();
        let adjustment = create_color_matrix_adjustment(matrix);
        assert_eq!(adjustment.color_matrix, matrix);
    }
}

mod get_adjustment_color_matrix {
    use super::*;

    #[test]
    fn returns_the_matrix_for_a_matrix_tier_adjustment() {
        let adjustment = create_invert_adjustment(1.0);
        let adj = Adjustment::Invert(adjustment.clone());
        let matrix = get_adjustment_color_matrix(&adj);
        assert!(matrix.is_some());
        assert_eq!(matrix.unwrap(), &adjustment.color_matrix);
    }

    #[test]
    fn returns_none_for_a_lut_tier_adjustment() {
        let adj: Adjustment = Adjustment::HueSaturation(create_hue_saturation_adjustment(0.0, 1.0, 0.0));
        assert!(get_adjustment_color_matrix(&adj).is_none());
    }
}

mod initialize_color_matrix_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_matrix_adjustment() {
        let mut out: ColorMatrixAdjustment = allocate_entity();
        initialize_color_matrix_adjustment(&mut out, create_identity_color_matrix());
        assert_eq!(out.color_matrix, create_identity_color_matrix());
    }
}

mod is_color_matrix_adjustment {
    use super::*;

    #[test]
    fn is_true_for_a_matrix_tier_adjustment_and_false_for_lut_tier() {
        let inv: Adjustment = Adjustment::Invert(create_invert_adjustment(1.0));
        assert!(is_color_matrix_adjustment(&inv));
        let hs: Adjustment = Adjustment::HueSaturation(create_hue_saturation_adjustment(0.0, 1.0, 0.0));
        assert!(!is_color_matrix_adjustment(&hs));
    }
}
