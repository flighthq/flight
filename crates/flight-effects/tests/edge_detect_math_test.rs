use super::*;

mod compute_outline_edge_params {
    use super::*;

    #[test]
    fn defaults_to_black_outline() {
        let effect = create_outline_effect();
        let mut out = [0.0; 6];
        compute_outline_edge_params(&mut out, &effect.read().unwrap());
        assert_eq!(&out[2..], &[0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn writes_threshold_feather_and_color_into_out() {
        let effect = create_outline_effect();
        effect.write().unwrap().threshold = Some(0.2);
        effect.write().unwrap().color = Some(0xff0000ff);
        let mut out = [0.0; 6];
        compute_outline_edge_params(&mut out, &effect.read().unwrap());
        for (actual, expected, bound) in [
            (out[0], 0.2, 5e-7),
            (out[1], 0.1, 5e-7),
            (out[2], 1.0, 5e-6),
            (out[3], 0.0, 5e-6),
            (out[4], 0.0, 5e-6),
            (out[5], 1.0, 5e-6),
        ] {
            // D1 f32 bound (TS: 5–6 decimal digits).
            assert_close(actual, expected, bound);
        }
    }
}

mod compute_outline_thickness_px {
    use super::*;

    #[test]
    fn returns_default_one() {
        assert_eq!(
            compute_outline_thickness_px(&create_outline_effect().read().unwrap()),
            1.0
        );
    }

    #[test]
    fn rounds_to_integer() {
        let effect = create_outline_effect();
        effect.write().unwrap().thickness = Some(2.7);
        assert_eq!(compute_outline_thickness_px(&effect.read().unwrap()), 3.0);
    }
}

mod compute_sketch_edge_params {
    use super::*;

    #[test]
    fn strength_one_produces_minimum_threshold() {
        let effect = create_sketch_effect();
        effect.write().unwrap().strength = Some(1.0);
        let mut out = [0.0; 2];
        compute_sketch_edge_params(&mut out, &effect.read().unwrap());
        // D1 f32 bound (TS: 2 decimal digits).
        assert_close(out[0], 0.05, 5e-3);
        assert_eq!(out[1], 1.0);
    }

    #[test]
    fn strength_zero_produces_threshold_at_one() {
        let effect = create_sketch_effect();
        effect.write().unwrap().strength = Some(0.0);
        let mut out = [0.0; 2];
        compute_sketch_edge_params(&mut out, &effect.read().unwrap());
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(out[0], 1.0, 5e-6);
        assert_eq!(out[1], 0.0);
    }

    #[test]
    fn writes_threshold_inversely_proportional_to_strength() {
        let effect = create_sketch_effect();
        effect.write().unwrap().strength = Some(1.0);
        let mut out = [0.0; 2];
        compute_sketch_edge_params(&mut out, &effect.read().unwrap());
        let threshold_one = out[0];
        effect.write().unwrap().strength = Some(0.5);
        compute_sketch_edge_params(&mut out, &effect.read().unwrap());
        assert!(out[0] > threshold_one);
    }
}

mod get_sobel_kernel_coefficients {
    use super::*;

    #[test]
    fn gx_and_gy_are_antisymmetric() {
        let mut out = [0.0; 18];
        get_sobel_kernel_coefficients(&mut out);
        assert_eq!(out[0], -out[2]);
        assert_eq!(out[9], -out[15]);
    }

    #[test]
    fn writes_eighteen_coefficients() {
        let mut out = [99.0; 18];
        get_sobel_kernel_coefficients(&mut out);
        assert_eq!([out[1], out[4], out[7]], [0.0; 3]);
        assert_eq!([out[12], out[13], out[14]], [0.0; 3]);
    }
}
