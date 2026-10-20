use flight_adjustments::*;

mod create_color_scale_bias_adjustment {
    use super::*;

    #[test]
    fn keeps_a_legible_bridge_payload_and_contributes_its_diagonal_matrix() {
        let mut value = create_color_scale_bias();
        initialize_color_scale_bias(&mut value, 0.5, 1.0, 1.0, 1.0, 0.0, 0.25, 0.0, 0.0);
        let adjustment = create_color_scale_bias_adjustment(&value);
        assert_eq!(adjustment.color_scale_bias.red_scale, 0.5);
        assert_eq!(adjustment.color_matrix[0], 0.5);
        assert_eq!(adjustment.color_matrix[9], 0.25);
    }
}

mod initialize_color_scale_bias_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_scale_bias_adjustment() {
        let value = create_color_scale_bias();
        let mut out = ColorScaleBiasAdjustment::default();
        initialize_color_scale_bias_adjustment(&mut out, &value);
        assert_eq!(out.color_scale_bias.red_scale, 1.0);
        assert_eq!(out.color_matrix[0], 1.0);
    }
}
