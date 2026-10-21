use flight_color::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn assert_approx_tight(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-6,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod get_color_contrast_ratio {
    use super::*;

    #[test]
    fn returns_21_for_black_on_white() {
        assert_approx(get_color_contrast_ratio(0xffffffff, 0x000000ff), 21.0);
    }

    #[test]
    fn returns_1_for_identical_colors() {
        assert_approx(get_color_contrast_ratio(0x808080ff, 0x808080ff), 1.0);
    }

    #[test]
    fn is_symmetric_order_of_arguments_does_not_matter() {
        let ratio1 = get_color_contrast_ratio(0xffffffff, 0x808080ff);
        let ratio2 = get_color_contrast_ratio(0x808080ff, 0xffffffff);
        assert_approx_tight(ratio1, ratio2);
    }
}

mod get_color_luminance {
    use super::*;

    #[test]
    fn returns_1_for_white() {
        assert_approx_tight(get_color_luminance(0xffffffff), 1.0);
    }

    #[test]
    fn returns_0_for_black() {
        assert_approx_tight(get_color_luminance(0x000000ff), 0.0);
    }

    #[test]
    fn ignores_the_alpha_channel() {
        assert_eq!(
            get_color_luminance(0xffffffff),
            get_color_luminance(0xffffff00)
        );
    }

    #[test]
    fn matches_expected_rec_709_value_for_mid_gray_srgb() {
        assert_approx(get_color_luminance(0x808080ff), 0.21586);
    }
}

mod get_rec2020_luminance_weights {
    use super::*;

    #[test]
    fn writes_the_itu_r_bt2020_weights_that_sum_to_1() {
        let mut out = [0.0_f32; 3];
        get_rec2020_luminance_weights(&mut out);
        assert_eq!(out[0], 0.2627);
        assert_eq!(out[1], 0.678);
        assert_eq!(out[2], 0.0593);
        assert_approx_tight(out[0] + out[1] + out[2], 1.0);
    }
}

mod get_rec709_luminance_weights {
    use super::*;

    #[test]
    fn writes_the_itu_r_bt709_weights_that_sum_to_1() {
        let mut out = [0.0_f32; 3];
        get_rec709_luminance_weights(&mut out);
        assert_eq!(out[0], 0.2126);
        assert_eq!(out[1], 0.7152);
        assert_eq!(out[2], 0.0722);
        assert_approx_tight(out[0] + out[1] + out[2], 1.0);
    }
}
