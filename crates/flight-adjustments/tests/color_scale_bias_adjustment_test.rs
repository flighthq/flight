use flight_adjustments::contract::*;
use flight_entity::allocate_entity;
use flight_materials::color_scale_bias::{create_color_scale_bias, initialize_color_scale_bias};

mod create_color_scale_bias_adjustment {
    use super::*;

    #[test]
    fn keeps_a_legible_bridge_payload_and_contributes_its_diagonal_matrix() {
        let mut value = create_color_scale_bias();
        initialize_color_scale_bias(&mut value);
        value.red_scale = 0.5;
        value.green_scale = 1.0;
        value.blue_scale = 1.0;
        value.alpha_scale = 1.0;
        value.red_bias = 0.0;
        value.green_bias = 0.25;
        value.blue_bias = 0.0;
        value.alpha_bias = 0.0;
        let adjustment = create_color_scale_bias_adjustment(&value);
        assert_eq!(adjustment.kind, "ColorScaleBiasAdjustment");
        assert_eq!(adjustment.color_scale_bias.red_scale, 0.5);
        assert_eq!(adjustment.color_matrix.unwrap()[0], 0.5);
        assert_eq!(adjustment.color_matrix.unwrap()[9], 0.25);
    }
}

mod initialize_color_scale_bias_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_scale_bias_adjustment() {
        let value = create_color_scale_bias();
        let mut out: ColorScaleBiasAdjustment = allocate_entity();
        initialize_color_scale_bias_adjustment(&mut out, &value);
        assert_eq!(out.color_scale_bias.red_scale, 1.0);
        assert_eq!(out.color_matrix.unwrap()[0], 1.0);
    }
}
