use flight_adjustments::contract::*;

mod apply_color_transform {
    use super::*;

    #[test]
    fn wraps_a_matrix_tier_adjustment_as_an_rgb_transform_at_opaque_alpha() {
        let adj: Adjustment = Adjustment::Invert(create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) })));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 1.0, 0.0, 0.0);
        assert!((out[0] - 0.0).abs() < 1e-4);
        assert!((out[1] - 1.0).abs() < 1e-4);
        assert!((out[2] - 1.0).abs() < 1e-4);
    }
}

mod get_adjustment_color_transform {
    use super::*;

    #[test]
    fn returns_true_for_a_lut_tier_adjustment() {
        let adj: Adjustment = Adjustment::HueSaturation(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(45.0), saturation: Some(1.0), lightness: Some(0.0) })));
        assert!(get_adjustment_color_transform(&adj));
    }

    #[test]
    fn returns_true_for_a_matrix_tier_adjustment() {
        let adj: Adjustment = Adjustment::Invert(create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) })));
        assert!(get_adjustment_color_transform(&adj));
    }
}

mod initialize_color_lut_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let adj: Adjustment = Adjustment::HueSaturation(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(1.0), lightness: Some(0.0) })));
        initialize_color_lut_adjustment(&adj);
    }
}

mod is_color_lut_adjustment {
    use super::*;

    #[test]
    fn is_true_for_a_lut_tier_adjustment() {
        let adj: Adjustment = Adjustment::HueSaturation(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(1.0), lightness: Some(0.0) })));
        assert!(is_color_lut_adjustment(&adj));
    }

    #[test]
    fn is_false_for_a_matrix_tier_adjustment() {
        let adj: Adjustment = Adjustment::Invert(create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) })));
        assert!(!is_color_lut_adjustment(&adj));
    }
}
