use super::*;

mod compute_kuwahara_gaussian_weights {
    use super::*;

    #[test]
    fn center_weight_is_positive_and_largest_for_positive_radius() {
        let mut out = [0.0; 16];
        let count = compute_kuwahara_gaussian_weights(&mut out, 3.0);
        assert!(out[0] > 0.0);
        assert!(out[1..count].iter().all(|weight| out[0] > *weight));
    }

    #[test]
    fn returns_normalized_weights_summing_to_one() {
        let mut out = [0.0; 16];
        let count = compute_kuwahara_gaussian_weights(&mut out, 3.0);
        // D1 f32 bound (TS: 5 decimal digits; N-term accumulation).
        assert_sum_close(out[..count].iter().sum(), 1.0, count, 5e-6);
    }

    #[test]
    fn returns_radius_plus_one_squared_weights() {
        let mut out = [0.0; 25];
        assert_eq!(compute_kuwahara_gaussian_weights(&mut out, 4.0), 25);
    }
}

mod compute_kuwahara_sector_offsets {
    use super::*;

    #[test]
    fn writes_all_four_sector_origins() {
        let mut out = [99.0; 8];
        compute_kuwahara_sector_offsets(&mut out, 3.0);
        assert_eq!(out, [-3.0, -3.0, 0.0, -3.0, -3.0, 0.0, 0.0, 0.0]);
    }
}

mod compute_kuwahara_sector_pixel_count {
    use super::*;

    #[test]
    fn returns_radius_plus_one_squared_for_default_radius_three() {
        let effect = create_kuwahara_effect();
        assert_eq!(
            compute_kuwahara_sector_pixel_count(&effect.read().unwrap()),
            16
        );
    }
}

mod compute_kuwahara_sector_size {
    use super::*;

    #[test]
    fn minimum_is_two_for_radius_one() {
        let effect = create_kuwahara_effect();
        effect.write().unwrap().radius = Some(1.0);
        assert_eq!(compute_kuwahara_sector_size(&effect.read().unwrap()), 2);
    }

    #[test]
    fn returns_radius_plus_one() {
        let effect = create_kuwahara_effect();
        effect.write().unwrap().radius = Some(3.0);
        assert_eq!(compute_kuwahara_sector_size(&effect.read().unwrap()), 4);
        effect.write().unwrap().radius = Some(5.0);
        assert_eq!(compute_kuwahara_sector_size(&effect.read().unwrap()), 6);
    }
}
