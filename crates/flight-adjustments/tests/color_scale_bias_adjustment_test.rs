use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_color_scale_bias {
    use super::*;

    #[test]
    fn defaults_to_the_identity_scale_and_zero_bias() {
        let out = create_color_scale_bias();
        assert_eq!(
            [out.red_scale, out.green_scale, out.blue_scale, out.alpha_scale],
            [1.0, 1.0, 1.0, 1.0]
        );
        assert_eq!(
            [out.red_bias, out.green_bias, out.blue_bias, out.alpha_bias],
            [0.0, 0.0, 0.0, 0.0]
        );
    }
}

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

mod initialize_color_scale_bias {
    use super::*;

    #[test]
    fn writes_every_scale_and_bias_channel() {
        let mut out: ColorScaleBias = allocate_entity();
        initialize_color_scale_bias(&mut out, 0.1, 0.2, 0.3, 0.4, -0.5, 0.6, 0.7, 0.8);
        assert_eq!(
            [out.red_scale, out.green_scale, out.blue_scale, out.alpha_scale],
            [0.1, 0.2, 0.3, 0.4]
        );
        assert_eq!(
            [out.red_bias, out.green_bias, out.blue_bias, out.alpha_bias],
            [-0.5, 0.6, 0.7, 0.8]
        );
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
        assert_eq!(out.color_matrix[0], 1.0);
    }
}
