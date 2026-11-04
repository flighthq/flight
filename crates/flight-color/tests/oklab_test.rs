use flight_color::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-3,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn assert_approx_tight(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod clamp_linear_rgb {
    use super::*;

    #[test]
    fn explicitly_clamps_out_of_gamut_channels_to_the_displayable_linear_srgb_range() {
        let mut rgb = [0.0_f32; 3];
        clamp_linear_rgb(&mut rgb, 1.25, -0.2, 0.5);
        assert_eq!(rgb[0], 1.0);
        assert_eq!(rgb[1], 0.0);
        assert_eq!(rgb[2], 0.5);
    }
}

mod linear_rgb_to_oklab {
    use super::*;

    #[test]
    fn maps_linear_white_to_l_near_1_a_near_0_b_near_0() {
        let mut out = [0.0_f32; 3];
        linear_rgb_to_oklab(&mut out, 1.0, 1.0, 1.0);
        assert_approx(out[0], 1.0);
        assert_approx_tight(out[1], 0.0);
        assert_approx_tight(out[2], 0.0);
    }

    #[test]
    fn maps_black_to_the_origin() {
        let mut out = [0.0_f32; 3];
        linear_rgb_to_oklab(&mut out, 0.0, 0.0, 0.0);
        assert_eq!(out[0], 0.0);
        assert_eq!(out[1], 0.0);
        assert_eq!(out[2], 0.0);
    }
}

mod oklab_to_linear_rgb {
    use super::*;

    #[test]
    fn round_trips_linear_rgb_through_oklab_for_a_saturated_color() {
        let mut lab = [0.0_f32; 3];
        linear_rgb_to_oklab(&mut lab, 0.5, 0.1, 0.8);
        let mut rgb = [0.0_f32; 3];
        oklab_to_linear_rgb(&mut rgb, lab[0], lab[1], lab[2]);
        assert_approx_tight(rgb[0], 0.5);
        assert_approx_tight(rgb[1], 0.1);
        assert_approx_tight(rgb[2], 0.8);
    }

    #[test]
    fn preserves_negative_and_greater_than_one_channels_for_out_of_gamut_oklab() {
        let mut rgb = [0.0_f32; 3];
        oklab_to_linear_rgb(&mut rgb, 0.5, 1.0, 0.0);
        assert!(rgb.iter().any(|&c| c < 0.0));
        assert!(rgb.iter().any(|&c| c > 1.0));
    }

    #[test]
    fn round_trips_out_of_gamut_linear_rgb_without_silently_clamping_channels() {
        let mut lab = [0.0_f32; 3];
        linear_rgb_to_oklab(&mut lab, 1.1, -0.05, 0.2);
        let mut rgb = [0.0_f32; 3];
        oklab_to_linear_rgb(&mut rgb, lab[0], lab[1], lab[2]);
        assert_approx_tight(rgb[0], 1.1);
        assert_approx_tight(rgb[1], -0.05);
        assert_approx_tight(rgb[2], 0.2);
    }
}
