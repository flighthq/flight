use flight_entity::allocate_entity;
use flight_unhomed::*;

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
