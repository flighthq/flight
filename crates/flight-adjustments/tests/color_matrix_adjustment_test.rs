use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_color_matrix_adjustment {
    use super::*;

    #[test]
    fn creates_an_authored_generic_matrix_adjustment() {
        let matrix = create_identity_color_matrix();
        let adjustment = create_color_matrix_adjustment(matrix);
        assert_eq!(adjustment.kind, "ColorMatrixAdjustment");
        assert_eq!(adjustment.color_matrix.unwrap(), matrix);
    }
}

mod get_adjustment_color_matrix {
    use super::*;

    #[test]
    fn returns_the_matrix_for_a_matrix_tier_adjustment() {
        let adjustment = create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) }));
        let matrix = get_adjustment_color_matrix(&adjustment);
        assert!(matrix.is_some());
        assert_eq!(matrix.unwrap(), &adjustment.color_matrix.unwrap());
    }

    #[test]
    fn returns_none_for_a_lut_tier_adjustment() {
        let adj = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(1.0), lightness: Some(0.0) }));
        assert!(get_adjustment_color_matrix(&adj).is_none());
    }
}

mod initialize_color_matrix_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_matrix_adjustment() {
        let mut out: ColorMatrixAdjustment = allocate_entity();
        initialize_color_matrix_adjustment(&mut out, "ColorMatrixAdjustment", create_identity_color_matrix());
        assert_eq!(out.kind, "ColorMatrixAdjustment");
        assert_eq!(out.color_matrix.unwrap(), create_identity_color_matrix());
    }
}

mod is_color_matrix_adjustment {
    use super::*;

    #[test]
    fn is_true_for_a_matrix_tier_adjustment_and_false_for_lut_tier() {
        let inv = create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) }));
        assert!(is_color_matrix_adjustment(&inv));
        let hs = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(1.0), lightness: Some(0.0) }));
        assert!(!is_color_matrix_adjustment(&hs));
    }
}
