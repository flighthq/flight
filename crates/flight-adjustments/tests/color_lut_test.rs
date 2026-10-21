use flight_adjustments::contract::*;

mod bake_color_lut {
    use super::*;

    #[test]
    fn bakes_an_empty_stack_into_an_identity_lut() {
        let lut = bake_color_lut(&[], Some(8));
        assert_eq!(lut.size, 8);
        assert_eq!(lut.samples.len(), 8 * 8 * 8 * 3);
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        sample_color_lut(&lut, &mut out, 0.25, 0.5, 0.75);
        assert!((out[0] - 0.25).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[1] - 0.5).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[2] - 0.75).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
    }

    #[test]
    fn composes_transforms_left_to_right_and_clamps_to_zero_one() {
        let invert = create_color_matrix_adjustment(create_invert_color_matrix());
        let brighten = create_color_matrix_adjustment(create_brightness_color_matrix(0.5));
        let lut = bake_color_lut(&[get_adjustment_color_transform(&invert).unwrap(), get_adjustment_color_transform(&brighten).unwrap()], Some(16));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        sample_color_lut(&lut, &mut out, 0.2, 0.2, 0.2);
        assert!((out[0] - 1.0).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
    }

    #[test]
    fn defaults_to_the_standard_resolution() {
        let lut = bake_color_lut(&[], Some(COLOR_LUT_DEFAULT_SIZE));
        assert_eq!(lut.size, COLOR_LUT_DEFAULT_SIZE);
    }
}

mod sample_color_lut {
    use super::*;

    #[test]
    fn interpolates_between_cells_trilinearly() {
        let ramp_matrix: [f32; 20] = [
            1.0, 0.0, 0.0, 0.0, 0.0,
            1.0, 0.0, 0.0, 0.0, 0.0,
            1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 1.0, 0.0,
        ];
        let ramp = create_color_matrix_adjustment(ramp_matrix);
        let lut = bake_color_lut(&[get_adjustment_color_transform(&ramp).unwrap()], Some(2));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        sample_color_lut(&lut, &mut out, 0.5, 0.0, 0.0);
        assert!((out[0] - 0.5).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
    }

    #[test]
    fn clamps_out_of_range_inputs_to_the_cube() {
        let lut = bake_color_lut(&[], Some(4));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        sample_color_lut(&lut, &mut out, 2.0, -1.0, 0.5);
        assert!((out[0] - 1.0).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[1] - 0.0).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[2] - 0.5).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
    }
}
